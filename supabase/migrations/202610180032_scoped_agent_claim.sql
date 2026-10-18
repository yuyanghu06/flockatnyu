-- Claim only the trusted worker's shared source scope. Other queue inputs remain
-- deferred and untouched; live authorization still runs at every later boundary.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-scoped-agent-claim',0));
create function public.agent_automation_claim_scoped(p_allowed_source_ids uuid[],p_min_events integer,p_max_age_seconds integer,p_cooldown_seconds integer,p_lease_seconds integer,p_max_inputs integer,p_max_bytes integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runner jsonb;n integer;oldest timestamptz;r record;inputs jsonb:='[]';snapshot jsonb:='{}';used integer:=2;size integer;token uuid:=gen_random_uuid();
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
 if (runner->>'lease_until')::timestamptz>clock_timestamp() then return jsonb_build_object('status','busy');end if;
 select count(*)::integer,min((s.data->>'received_at')::timestamptz) into n,oldest
 from public.agent_automation_state s join public.agent_input_cache c on s.key='input:'||c.uuid::text
 where s.data->>'status'='pending'
 and s.data->>'source_id'=any(p_allowed_source_ids::text[])
 and c.raw_response->>'source_id'=s.data->>'source_id'
 and coalesce((s.data->>'next_attempt_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp();
 if n=0 then return jsonb_build_object('status','empty');end if;
 if (runner->>'last_started')::timestamptz+make_interval(secs=>p_cooldown_seconds)>clock_timestamp() then return jsonb_build_object('status','cooldown');end if;
 if n<p_min_events and oldest>clock_timestamp()-make_interval(secs=>p_max_age_seconds) then return jsonb_build_object('status','waiting');end if;
 for r in select c.uuid,c.raw_response from public.agent_automation_state s
  join public.agent_input_cache c on s.key='input:'||c.uuid::text where s.data->>'status'='pending'
 and s.data->>'source_id'=any(p_allowed_source_ids::text[])
 and c.raw_response->>'source_id'=s.data->>'source_id'
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

revoke all on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) to service_role;
comment on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) is
 'Service-only scoped queue selection; scope filters count, oldest receipt and candidates before original bodies return. No source grants or queue cleanup.';
notify pgrst,'reload schema';
commit;
