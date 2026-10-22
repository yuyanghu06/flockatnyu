-- Queue recovery metadata only: source bodies stay in the existing two-column
-- cache. No existing inputs are deleted or classified merely by applying036.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-agent-retry-quarantine',0));

-- Shared settlement is itself fenced: callers cannot supply a snapshot or mark
-- an active lease expired. A token can settle once, including crash recovery.
create function public.agent_automation_settle_lease(p_token uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare runner jsonb;r record;attempts integer;quarantine boolean;failed boolean;
begin
 if p_outcome is null or p_outcome not in ('shutdown','lease_expired','timeout','forbidden','stale','invalid_batch','incomplete_batch','round_limit','call_limit','invalid_tool_call','invalid_completion','tool_failed','context_limit','preflight_failed','not_configured','audit_unavailable','unavailable')
 then raise check_violation using message='Invalid queue outcome';end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text then return false;end if;
 if p_outcome='lease_expired' then
  if not coalesce((runner->>'lease_until')::timestamptz<=clock_timestamp(),false) then return false;end if;
 elsif not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false) then return false;
 end if;
 failed:=p_outcome<>'shutdown';
 for r in select s.key,s.data,c.uuid,c.raw_response from public.agent_automation_state s
  join public.agent_input_cache c on s.key='input:'||c.uuid::text
  where s.data->>'status'='pending' and runner->'snapshot' ? c.uuid::text
  and md5(c.raw_response::text)=runner->'snapshot'->>c.uuid::text
  and c.raw_response->>'source_id'=s.data->>'source_id'
  and c.raw_response->>'source_id'=coalesce(runner->'sources'->>c.uuid::text,c.raw_response->>'source_id')
  for update of s,c loop
  attempts:=least(5,coalesce((r.data->>'failed_attempts')::integer,0)+case when failed then 1 else 0 end);
  quarantine:=failed and attempts>=5 and (select count(*) from jsonb_object_keys(runner->'snapshot'))=1;
  update public.agent_automation_state set data=(data-'next_attempt_at')||jsonb_build_object(
   'status',case when quarantine then 'quarantined' else 'pending' end,
   'failed_attempts',attempts,'retry_isolated',true,'last_outcome',p_outcome)
   ||case when quarantine then jsonb_build_object('quarantined_at',clock_timestamp(),
     'quarantine_until',clock_timestamp()+interval '24 hours','payload_hash',md5(r.raw_response::text))
    else jsonb_build_object('next_attempt_at',clock_timestamp()+interval '5 minutes') end
  where key=r.key;
 end loop;
 update public.agent_automation_state set data=data-'token'-'lease_until'-'snapshot'-'sources'
 where key='runner';
 return true;
end $$;

create function public.agent_automation_fail(p_token uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome is null or p_outcome in ('shutdown','lease_expired') then
  raise check_violation using message='Invalid queue outcome';
 end if;
 return public.agent_automation_settle_lease(p_token,p_outcome);
end $$;

create or replace function public.agent_automation_release(p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 return public.agent_automation_settle_lease(p_token,'shutdown');
end $$;

-- Maintenance always runs from the poll/claim path, even with no eligible work.
-- Hash/source mismatches are surfaced as metadata requiring service review;
-- replacement bodies are never deleted by an old quarantine snapshot.
create or replace function public.agent_automation_claim_scoped(p_allowed_source_ids uuid[],p_min_events integer,p_max_age_seconds integer,p_cooldown_seconds integer,p_lease_seconds integer,p_max_inputs integer,p_max_bytes integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runner jsonb;n integer;oldest timestamptz;r record;inputs jsonb:='[]';snapshot jsonb:='{}';sources jsonb:='{}';used integer:=2;size integer;token uuid:=gen_random_uuid();has_fresh boolean;has_retry boolean;lane text;purged boolean;
begin
 if p_allowed_source_ids is null or cardinality(p_allowed_source_ids) not between 1 and 500
  or array_ndims(p_allowed_source_ids) is distinct from 1 or array_position(p_allowed_source_ids,null) is not null
  or cardinality(p_allowed_source_ids)<>(select count(distinct id) from unnest(p_allowed_source_ids) id)
 then raise check_violation using message='Invalid source scope';end if;
 if p_min_events not between 1 and 100 or p_max_age_seconds not between 1 and 86400
  or p_cooldown_seconds not between 60 and 86400 or p_lease_seconds not between 120 and 300
  or p_max_inputs not between 1 and 20 or p_max_bytes not between 1024 and 65536
  or p_min_events is null or p_max_age_seconds is null or p_cooldown_seconds is null
  or p_lease_seconds is null or p_max_inputs is null or p_max_bytes is null
 then raise check_violation using message='Invalid claim limits';end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 for r in select s.key,s.data from public.agent_automation_state s
  where s.key like 'input:%' and s.data->>'status'='quarantined'
  and (s.data->>'quarantine_until')::timestamptz<=clock_timestamp()
  order by s.data->>'quarantine_until',s.key limit 100 for update loop
  delete from public.agent_input_cache c where 'input:'||c.uuid::text=r.key
   and md5(c.raw_response::text)=r.data->>'payload_hash'
   and c.raw_response->>'source_id'=r.data->>'source_id';
  purged:=found or not exists(select 1 from public.agent_input_cache c where 'input:'||c.uuid::text=r.key);
  update public.agent_automation_state set data=jsonb_build_object(
   'status',case when purged then 'quarantine_expired' else 'quarantine_changed' end,
   'source_id',r.data->'source_id','payload_hash',r.data->'payload_hash',
   'failed_attempts',r.data->'failed_attempts','last_outcome',r.data->'last_outcome',
   'expired_at',clock_timestamp()) where key=r.key;
 end loop;
 if (runner->>'lease_until')::timestamptz>clock_timestamp() then return jsonb_build_object('status','busy');end if;
 if runner ? 'token' then
  perform public.agent_automation_settle_lease((runner->>'token')::uuid,'lease_expired');
  select data into runner from public.agent_automation_state where key='runner';
 end if;
 select count(*)::integer,min((s.data->>'received_at')::timestamptz),
  bool_or(not coalesce((s.data->>'retry_isolated')::boolean,false) and octet_length(jsonb_build_object('uuid',c.uuid,'raw_response',c.raw_response)::text)+3<=p_max_bytes),
  bool_or(coalesce((s.data->>'retry_isolated')::boolean,false) and octet_length(jsonb_build_object('uuid',c.uuid,'raw_response',c.raw_response)::text)+3<=p_max_bytes)
 into n,oldest,has_fresh,has_retry
 from public.agent_automation_state s join public.agent_input_cache c on s.key='input:'||c.uuid::text
 where s.data->>'status'='pending'
 and s.data->>'source_id'=any(p_allowed_source_ids::text[])
 and c.raw_response->>'source_id'=s.data->>'source_id'
 and coalesce((s.data->>'next_attempt_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp();
 if n=0 then return jsonb_build_object('status','empty');end if;
 if (runner->>'last_started')::timestamptz+make_interval(secs=>p_cooldown_seconds)>clock_timestamp() then return jsonb_build_object('status','cooldown');end if;
 if n<p_min_events and oldest>clock_timestamp()-make_interval(secs=>p_max_age_seconds) then return jsonb_build_object('status','waiting');end if;
 if not has_fresh and not has_retry then return jsonb_build_object('status','input_too_large');end if;
 lane:=case when has_retry and (not has_fresh or runner->>'last_lane'='fresh') then 'retry' else 'fresh' end;
 for r in select c.uuid,c.raw_response from public.agent_automation_state s
  join public.agent_input_cache c on s.key='input:'||c.uuid::text where s.data->>'status'='pending'
  and s.data->>'source_id'=any(p_allowed_source_ids::text[])
  and c.raw_response->>'source_id'=s.data->>'source_id'
  and coalesce((s.data->>'next_attempt_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp()
  and coalesce((s.data->>'retry_isolated')::boolean,false)=(lane='retry')
  and octet_length(jsonb_build_object('uuid',c.uuid,'raw_response',c.raw_response)::text)+3<=p_max_bytes
  order by s.data->>'received_at',c.uuid limit 100 for update of s,c loop
  size:=octet_length(jsonb_build_object('uuid',r.uuid,'raw_response',r.raw_response)::text)+1;
  if used+size>p_max_bytes then continue;end if;
  inputs:=inputs||jsonb_build_array(jsonb_build_object('uuid',r.uuid,'raw_response',r.raw_response));
  snapshot:=snapshot||jsonb_build_object(r.uuid::text,md5(r.raw_response::text));
  sources:=sources||jsonb_build_object(r.uuid::text,r.raw_response->>'source_id');used:=used+size;
  exit when lane='retry' or jsonb_array_length(inputs)>=p_max_inputs;
 end loop;
 if jsonb_array_length(inputs)=0 then return jsonb_build_object('status','input_too_large');end if;
 update public.agent_automation_state set data=jsonb_build_object('token',token,'lease_until',clock_timestamp()+make_interval(secs=>p_lease_seconds),
  'last_started',clock_timestamp(),'last_lane',lane,'snapshot',snapshot,'sources',sources) where key='runner';
 return jsonb_build_object('status','ready','leaseToken',token,'inputs',inputs);
end $$;

create or replace function public.agent_automation_finish(p_token uuid,p_handled_ids uuid[])
returns boolean language plpgsql security invoker set search_path='' as $$
declare runner jsonb;id uuid;current_body jsonb;metadata jsonb;
begin
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
  or p_handled_ids is null or cardinality(p_handled_ids) not between 1 and 20
  or array_ndims(p_handled_ids) is distinct from 1 or array_position(p_handled_ids,null) is not null
  or cardinality(p_handled_ids)<>(select count(distinct v) from unnest(p_handled_ids) v) then return false;end if;
 foreach id in array p_handled_ids loop
  select c.raw_response,s.data into current_body,metadata from public.agent_input_cache c
   join public.agent_automation_state s on s.key='input:'||c.uuid::text where c.uuid=id for update of c,s;
  if not found or metadata->>'status' is distinct from 'pending' or not (runner->'snapshot' ? id::text)
   or md5(current_body::text) is distinct from runner->'snapshot'->>id::text
   or current_body->>'source_id' is distinct from metadata->>'source_id'
   or current_body->>'source_id' is distinct from coalesce(runner->'sources'->>id::text,current_body->>'source_id') then return false;end if;
 end loop;
 delete from public.agent_input_cache where uuid=any(p_handled_ids);
 update public.agent_automation_state set data=(data-'received_at'-'next_attempt_at')||jsonb_build_object('status','done','completed_at',clock_timestamp())
 where key in (select 'input:'||v::text from unnest(p_handled_ids) v);
 -- Only unhandled, still-matching pending snapshots are isolated/deferred.
 perform public.agent_automation_settle_lease(p_token,'incomplete_batch');
 return true;
end $$;

-- Exact, manual service recovery only. This is deliberately absent from model
-- tools/public APIs and is bounded to the retained24-hour quarantine snapshot.
create function public.agent_automation_requeue(p_input_id uuid,p_allowed_source_ids uuid[],p_expected_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare runner jsonb;metadata jsonb;body jsonb;
begin
 if p_input_id is null or p_expected_hash is null or p_expected_hash !~ '^[a-f0-9]{32}$'
  or p_allowed_source_ids is null or cardinality(p_allowed_source_ids) not between 1 and 500
  or array_ndims(p_allowed_source_ids) is distinct from 1 or array_position(p_allowed_source_ids,null) is not null
  or cardinality(p_allowed_source_ids)<>(select count(distinct id) from unnest(p_allowed_source_ids) id) then return false;end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if (runner->>'lease_until')::timestamptz>clock_timestamp() then return false;end if;
 select s.data,c.raw_response into metadata,body from public.agent_automation_state s
  join public.agent_input_cache c on s.key='input:'||c.uuid::text where c.uuid=p_input_id for update of s,c;
 if not found or metadata->>'status' is distinct from 'quarantined'
  or not coalesce((metadata->>'quarantine_until')::timestamptz>clock_timestamp(),false)
  or not coalesce(metadata->>'source_id'=any(p_allowed_source_ids::text[]),false)
  or body->>'source_id' is distinct from metadata->>'source_id'
  or metadata->>'payload_hash' is distinct from p_expected_hash
  or md5(body::text) is distinct from p_expected_hash then return false;end if;
 update public.agent_automation_state set data=(data-'quarantined_at'-'quarantine_until'-'payload_hash'-'last_outcome')
  ||jsonb_build_object('status','pending','failed_attempts',0,'retry_isolated',true,'next_attempt_at',clock_timestamp())
 where key='input:'||p_input_id::text;
 return true;
end $$;

-- Legacy unscoped selection is unused by the runtime and must not bypass036.
revoke all on function public.agent_automation_claim(integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.agent_automation_settle_lease(uuid,text),public.agent_automation_fail(uuid,text),
 public.agent_automation_release(uuid),public.agent_automation_finish(uuid,uuid[]),
 public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer),
 public.agent_automation_requeue(uuid,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function public.agent_automation_settle_lease(uuid,text),public.agent_automation_fail(uuid,text),
 public.agent_automation_release(uuid),public.agent_automation_finish(uuid,uuid[]),
 public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer),
 public.agent_automation_requeue(uuid,uuid[],text) to service_role;
comment on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) is
 'Service-only scoped queue selection with fair fresh/singleton retry lanes, fenced expired-lease recovery and bounded24-hour quarantine cleanup. Never grants source access.';
comment on column public.agent_input_cache.uuid is
 'Unique cache-entry identifier; successful completion deletes exact snapshots. Expired quarantines delete only their matching source/hash snapshot after24hours, independently of processing success.';
notify pgrst,'reload schema';
commit;
