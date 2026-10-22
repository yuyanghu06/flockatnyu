-- Preserve036 queue maintenance when dynamic authorization has no sources.
-- No table/data changes at apply time; only this existing invoker is replaced.
begin;

create or replace function public.agent_automation_claim_scoped(p_allowed_source_ids uuid[],p_min_events integer,p_max_age_seconds integer,p_cooldown_seconds integer,p_lease_seconds integer,p_max_inputs integer,p_max_bytes integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runner jsonb;n integer;oldest timestamptz;r record;inputs jsonb:='[]';snapshot jsonb:='{}';sources jsonb:='{}';used integer:=2;size integer;token uuid:=gen_random_uuid();has_fresh boolean;has_retry boolean;lane text;purged boolean;
begin
 if p_allowed_source_ids is null or cardinality(p_allowed_source_ids) not between 0 and 500
  or (cardinality(p_allowed_source_ids)>0 and array_ndims(p_allowed_source_ids) is distinct from 1) or array_position(p_allowed_source_ids,null) is not null
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
 -- Empty scope still performs global bounded retention and lease maintenance,
 -- but cannot examine/select pending bodies or issue a new processing lease.
 if cardinality(p_allowed_source_ids)=0 then return jsonb_build_object('status','empty');end if;
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

revoke all on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) to service_role;
comment on function public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer) is
 'Service-only scoped queue selection with fair retries and bounded quarantine/lease maintenance. An empty UUID scope performs only maintenance and cannot select pending input bodies.';
notify pgrst,'reload schema';
commit;
