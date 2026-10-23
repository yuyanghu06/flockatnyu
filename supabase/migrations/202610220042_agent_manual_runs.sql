-- Metadata-only manual dispatch; business originals stay in the existing queue.
begin;

create or replace function public.agent_automation_claim_forced(p_allowed_source_ids uuid[],p_min_events integer,p_max_age_seconds integer,p_cooldown_seconds integer,p_lease_seconds integer,p_max_inputs integer,p_max_bytes integer)
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

revoke all on function public.agent_automation_claim_forced(uuid[],integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.agent_automation_claim_forced(uuid[],integer,integer,integer,integer,integer,integer) to service_role;
comment on function public.agent_automation_claim_forced(uuid[],integer,integer,integer,integer,integer,integer) is
 'Service-only forced scoped queue selection. Bypasses threshold/cooldown only; preserves retry eligibility, byte/input limits, fair retry isolation, snapshots and the global runner lease. Empty scope performs bounded maintenance only.';

create function public.agent_manual_run_valid_channels(p_ids text[])
returns boolean language sql immutable security invoker set search_path='' as $$
 select p_ids is not null and coalesce(array_ndims(p_ids),1)=1 and cardinality(p_ids)<=30
  and cardinality(p_ids)=(select count(distinct v) from unnest(p_ids) v)
  and not exists(select 1 from unnest(p_ids) v where v !~ '^[0-9]{1,20}$')
$$;
create table public.agent_manual_runs (
 uuid uuid primary key default gen_random_uuid(),
 channel_ids text[] not null check(public.agent_manual_run_valid_channels(channel_ids)),
 state text not null default 'queued' check(state in ('queued','running','completed','failed')),
 request_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default statement_timestamp(),
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 expires_at timestamptz not null default statement_timestamp()+interval '24 hours',
 started_at timestamptz,
 finished_at timestamptz,
 result jsonb,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
 check((state='running')=(request_token is not null and lease_until is not null)),
 check(result is null or jsonb_typeof(result)='object' and octet_length(result::text)<=512)
);
comment on table public.agent_manual_runs is 'Service-only 24-hour metadata dispatch requests. Selected channel IDs only; no original bodies, model text, credentials or raw provider results. One request executes one bounded standard cycle.';
create index agent_manual_runs_dispatch_idx on public.agent_manual_runs(state,next_attempt_at,created_at);
alter table public.agent_manual_runs enable row level security;
alter table public.agent_manual_runs force row level security;
revoke all on table public.agent_manual_runs from public,anon,authenticated,service_role;

create function public.agent_manual_run_start(p_channel_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
 if not public.agent_manual_run_valid_channels(p_channel_ids) then return jsonb_build_object('status','invalid_request');end if;
 perform pg_advisory_xact_lock(420022,1);
 delete from public.agent_manual_runs where expires_at<=clock_timestamp();
 if (select count(*) from public.agent_manual_runs where state in ('queued','running'))>=20 then return jsonb_build_object('status','capacity');end if;
 insert into public.agent_manual_runs(channel_ids) values(p_channel_ids) returning uuid into id;
 return jsonb_build_object('status','queued','runId',id);
end $$;

create function public.agent_manual_run_read(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.agent_manual_runs;
begin
 select * into r from public.agent_manual_runs where uuid=p_run_id and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('status','not_found');end if;
 return jsonb_build_object('status','ready','run',jsonb_strip_nulls(jsonb_build_object(
  'runId',r.uuid,'state',r.state,'createdAt',r.created_at,'updatedAt',r.updated_at,
  'expiresAt',r.expires_at,'startedAt',r.started_at,'finishedAt',r.finished_at,'result',r.result)));
end $$;

create function public.agent_manual_run_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.agent_manual_runs;token uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(420022,1);
 delete from public.agent_manual_runs where expires_at<=stamp;
 update public.agent_manual_runs set state='queued',request_token=null,lease_until=null,updated_at=stamp
  where state='running' and lease_until<=stamp;
 if exists(select 1 from public.agent_manual_runs where state='running') then return jsonb_build_object('status','busy');end if;
 select * into r from public.agent_manual_runs where state='queued' and next_attempt_at<=stamp order by created_at,uuid limit 1 for update;
 if not found then return jsonb_build_object('status','empty');end if;
 update public.agent_manual_runs set state='running',request_token=token,lease_until=stamp+interval '15 minutes',
  updated_at=stamp,started_at=coalesce(started_at,stamp) where uuid=r.uuid;
 return jsonb_build_object('status','ready','runId',r.uuid,'requestToken',token,'channelIds',to_jsonb(r.channel_ids));
end $$;

create function public.agent_manual_run_finish(p_run_id uuid,p_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare safe jsonb;k text;v jsonb;changed integer;outcome text;
begin
 if jsonb_typeof(p_result) is distinct from 'object' then return jsonb_build_object('status','invalid_request');end if;
 outcome:=p_result->>'status';
 if outcome is null or outcome not in ('completed','empty','disabled','not_configured','forbidden','stale','timeout','round_limit','call_limit','invalid_batch','incomplete_batch','invalid_tool_call','invalid_completion','tool_failed','context_limit','preflight_failed','audit_unavailable','unavailable','input_too_large','aborted') then return jsonb_build_object('status','invalid_request');end if;
 safe:=jsonb_build_object('status',outcome);
 for k,v in select * from jsonb_each(p_result) loop
  if k='status' then continue;end if;
  if k not in ('handled','remaining','calls') or jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]{1,5}$' or v::text::integer>10000 then return jsonb_build_object('status','invalid_request');end if;
  safe:=safe||jsonb_build_object(k,v);
 end loop;
 update public.agent_manual_runs set state=case when outcome in ('completed','empty') then 'completed' else 'failed' end,
  result=safe,updated_at=clock_timestamp(),finished_at=clock_timestamp(),request_token=null,lease_until=null
  where uuid=p_run_id and state='running' and request_token=p_token and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 get diagnostics changed=row_count;
 return jsonb_build_object('status',case when changed=1 then 'ready' else 'stale' end);
end $$;

create function public.agent_manual_run_requeue(p_run_id uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.agent_manual_runs set state='queued',request_token=null,lease_until=null,
  next_attempt_at=clock_timestamp()+interval '5 seconds',updated_at=clock_timestamp()
  where uuid=p_run_id and state='running' and request_token=p_token and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 get diagnostics changed=row_count;
 return jsonb_build_object('status',case when changed=1 then 'ready' else 'stale' end);
end $$;

revoke all on function public.agent_manual_run_valid_channels(text[]),public.agent_manual_run_start(text[]),
 public.agent_manual_run_read(uuid),public.agent_manual_run_claim(),public.agent_manual_run_finish(uuid,uuid,jsonb),
 public.agent_manual_run_requeue(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.agent_manual_run_start(text[]),public.agent_manual_run_read(uuid),
 public.agent_manual_run_claim(),public.agent_manual_run_finish(uuid,uuid,jsonb),public.agent_manual_run_requeue(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
