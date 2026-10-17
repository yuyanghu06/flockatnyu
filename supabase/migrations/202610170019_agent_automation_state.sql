-- Metadata only. Original source bodies remain exclusively in agent_input_cache.
begin;
create table public.agent_automation_state (
 key text primary key,
 data jsonb not null
);
comment on table public.agent_automation_state is
 'Server-owned queue identities, leases, cooldowns, action receipts and subscription checkpoints. Never store source message bodies here.';
insert into public.agent_automation_state values ('runner','{}');

create function public.agent_automation_enqueue(p_input_id uuid,p_envelope jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_input_id is null or jsonb_typeof(p_envelope) is distinct from 'object'
  or not (p_envelope ?& array['source','source_id','event_type','event_id','revision','payload'])
  or octet_length(p_envelope::text)>62000
  or coalesce(p_envelope->>'source','') !~ '^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$'
  or coalesce(p_envelope->>'event_type','') !~ '^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$'
  or coalesce(p_envelope->>'source_id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_:@./=-]{0,199}$'
  or coalesce(p_envelope->>'event_id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_:@./=-]{0,199}$'
  or coalesce(p_envelope->>'revision','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_:@./=-]{0,199}$'
 then raise check_violation using message='Invalid input envelope';end if;
 perform 1 from public.agent_automation_state where key='runner' for update;
 if exists(select 1 from public.agent_automation_state where key='input:'||p_input_id::text) then
  return jsonb_build_object('status','duplicate','inputId',p_input_id);
 end if;
 -- Receipt time is authoritative at the server, never taken from source content.
 p_envelope:=jsonb_build_object('source',p_envelope->'source','source_id',p_envelope->'source_id',
  'event_type',p_envelope->'event_type','event_id',p_envelope->'event_id','revision',p_envelope->'revision',
  'received_at',clock_timestamp(),'payload',p_envelope->'payload');
 insert into public.agent_input_cache(uuid,raw_response) values(p_input_id,p_envelope);
 insert into public.agent_automation_state(key,data) values('input:'||p_input_id::text,
  (p_envelope-'payload')||jsonb_build_object('status','pending'));
 return jsonb_build_object('status','queued','inputId',p_input_id);
end $$;

create function public.agent_automation_claim(p_min_events integer,p_max_age_seconds integer,p_cooldown_seconds integer,p_lease_seconds integer,p_max_inputs integer,p_max_bytes integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runner jsonb;n integer;oldest timestamptz;r record;inputs jsonb:='[]';snapshot jsonb:='{}';used integer:=2;size integer;token uuid:=gen_random_uuid();
begin
 if p_min_events not between 1 and 100 or p_max_age_seconds not between 1 and 86400
  or p_cooldown_seconds not between 60 and 86400 or p_lease_seconds not between 120 and 300
  or p_max_inputs not between 1 and 20 or p_max_bytes not between 1024 and 65536
  or p_min_events is null or p_max_age_seconds is null or p_cooldown_seconds is null
  or p_lease_seconds is null or p_max_inputs is null or p_max_bytes is null
 then raise check_violation using message='Invalid claim limits';end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if (runner->>'lease_until')::timestamptz>clock_timestamp() then return jsonb_build_object('status','busy');end if;
 select count(*)::integer,min((s.data->>'received_at')::timestamptz) into n,oldest
 from public.agent_automation_state s join public.agent_input_cache c on s.key='input:'||c.uuid::text
 where s.data->>'status'='pending'
 and coalesce((s.data->>'next_attempt_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp();
 if n=0 then return jsonb_build_object('status','empty');end if;
 if (runner->>'last_started')::timestamptz+make_interval(secs=>p_cooldown_seconds)>clock_timestamp() then return jsonb_build_object('status','cooldown');end if;
 if n<p_min_events and oldest>clock_timestamp()-make_interval(secs=>p_max_age_seconds) then return jsonb_build_object('status','waiting');end if;
 for r in select c.uuid,c.raw_response from public.agent_automation_state s
  join public.agent_input_cache c on s.key='input:'||c.uuid::text where s.data->>'status'='pending'
  and coalesce((s.data->>'next_attempt_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp()
  order by s.data->>'received_at',c.uuid limit 100 loop
  size:=octet_length(jsonb_build_object('uuid',r.uuid,'raw_response',r.raw_response)::text)+1;
  if used+size>p_max_bytes then continue;end if;
  inputs:=inputs||jsonb_build_array(jsonb_build_object('uuid',r.uuid,'raw_response',r.raw_response));
  snapshot:=snapshot||jsonb_build_object(r.uuid::text,md5(r.raw_response::text));used:=used+size;
  exit when jsonb_array_length(inputs)>=p_max_inputs;
 end loop;
 if jsonb_array_length(inputs)=0 then return jsonb_build_object('status','input_too_large');end if;
 update public.agent_automation_state set data=jsonb_build_object('token',token,'lease_until',clock_timestamp()+make_interval(secs=>p_lease_seconds),
  'last_started',clock_timestamp(),'snapshot',snapshot) where key='runner';
 return jsonb_build_object('status','ready','leaseToken',token,'inputs',inputs);
end $$;

create function public.agent_automation_renew(p_token uuid,p_lease_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_lease_seconds is null or p_lease_seconds not between 120 and 300 then return false;end if;
 update public.agent_automation_state set data=jsonb_set(data,'{lease_until}',to_jsonb(clock_timestamp()+make_interval(secs=>p_lease_seconds)))
 where key='runner' and data->>'token'=p_token::text and (data->>'lease_until')::timestamptz>clock_timestamp();
 return found;
end $$;

create function public.agent_automation_action(p_token uuid,p_action_key text,p_complete boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runner jsonb;receipt jsonb;
begin
 if p_action_key is null or p_action_key !~ '^[a-f0-9]{64}$' or p_complete is null then raise check_violation using message='Invalid action';end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if runner->>'token' is distinct from p_token::text or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false) then return jsonb_build_object('status','stale');end if;
 select data into receipt from public.agent_automation_state where key='action:'||p_action_key;
 if receipt->>'status'='succeeded' then return jsonb_build_object('status','completed');end if;
 if p_complete and (receipt is null or receipt->>'token' is distinct from p_token::text) then return jsonb_build_object('status','stale');end if;
 insert into public.agent_automation_state(key,data) values('action:'||p_action_key,
  jsonb_build_object('status',case when p_complete then 'succeeded' else 'started' end,'token',p_token,'updated_at',clock_timestamp()))
 on conflict(key) do update set data=excluded.data;
 return jsonb_build_object('status',case when p_complete then 'completed' else 'execute' end);
end $$;

create function public.agent_automation_finish(p_token uuid,p_handled_ids uuid[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare runner jsonb;id uuid;current_body jsonb;
begin
 select data into runner from public.agent_automation_state where key='runner' for update;
 if runner->>'token' is distinct from p_token::text or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
  or p_handled_ids is null or cardinality(p_handled_ids) not between 1 and 20
  or cardinality(p_handled_ids)<>(select count(distinct v) from unnest(p_handled_ids) v) then return false;end if;
 foreach id in array p_handled_ids loop
  select raw_response into current_body from public.agent_input_cache where uuid=id for update;
  if not found or not (runner->'snapshot' ? id::text)
   or md5(current_body::text) is distinct from runner->'snapshot'->>id::text then return false;end if;
 end loop;
 delete from public.agent_input_cache where uuid=any(p_handled_ids);
 update public.agent_automation_state set data=(data-'received_at'-'next_attempt_at')||jsonb_build_object('status','done','completed_at',clock_timestamp())
 where key in (select 'input:'||v::text from unnest(p_handled_ids) v);
 update public.agent_automation_state set data=data||jsonb_build_object('next_attempt_at',clock_timestamp()+interval '5 minutes')
 where key in (select 'input:'||v from jsonb_object_keys(runner->'snapshot') v)
 and data->>'status'='pending';
 update public.agent_automation_state set data=jsonb_build_object('last_started',runner->'last_started') where key='runner';
 return true;
end $$;

create function public.agent_automation_release(p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare runner jsonb;
begin
 select data into runner from public.agent_automation_state where key='runner' for update;
 if runner->>'token' is distinct from p_token::text then return false;end if;
 update public.agent_automation_state set data=data||jsonb_build_object('next_attempt_at',clock_timestamp()+interval '5 minutes')
 where key in (select 'input:'||v from jsonb_object_keys(runner->'snapshot') v)
 and data->>'status'='pending';
 update public.agent_automation_state set data=jsonb_build_object('last_started',data->'last_started')
 where key='runner' and data->>'token'=p_token::text;
 return found;
end $$;

-- Bounded subscription checkpoints/leases; these keys cannot touch runner,
-- queue identities or action receipts. Do not include email/message bodies.
create function public.agent_subscription_get_state(p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_key is null or p_key !~ '^subscription:[a-zA-Z0-9_:@./=-]{1,200}$' then raise check_violation using message='Invalid subscription key';end if;
 return (select data from public.agent_automation_state where key=p_key);
end $$;
create function public.agent_subscription_cas_state(p_key text,p_expected jsonb,p_next jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare current_data jsonb;
begin
 if p_key is null or p_key !~ '^subscription:[a-zA-Z0-9_:@./=-]{1,200}$'
  or p_next is not null and (jsonb_typeof(p_next) is distinct from 'object' or octet_length(p_next::text)>65536)
 then raise check_violation using message='Invalid subscription state';end if;
 perform pg_advisory_xact_lock(hashtext('agent-subscription:'||p_key));
 select data into current_data from public.agent_automation_state where key=p_key;
 if current_data is distinct from p_expected then return false;end if;
 if p_next is null then delete from public.agent_automation_state where key=p_key;
 else insert into public.agent_automation_state(key,data) values(p_key,p_next) on conflict(key) do update set data=excluded.data;end if;
 return true;
end $$;

alter table public.agent_automation_state enable row level security;
alter table public.agent_automation_state force row level security;
revoke all on table public.agent_automation_state from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.agent_automation_state to service_role;
revoke all on function public.agent_automation_enqueue(uuid,jsonb),
 public.agent_automation_claim(integer,integer,integer,integer,integer,integer),
 public.agent_automation_renew(uuid,integer),public.agent_automation_action(uuid,text,boolean),
 public.agent_automation_finish(uuid,uuid[]),public.agent_automation_release(uuid),
 public.agent_subscription_get_state(text),public.agent_subscription_cas_state(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.agent_automation_enqueue(uuid,jsonb),
 public.agent_automation_claim(integer,integer,integer,integer,integer,integer),
 public.agent_automation_renew(uuid,integer),public.agent_automation_action(uuid,text,boolean),
 public.agent_automation_finish(uuid,uuid[]),public.agent_automation_release(uuid),
 public.agent_subscription_get_state(text),public.agent_subscription_cas_state(text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
