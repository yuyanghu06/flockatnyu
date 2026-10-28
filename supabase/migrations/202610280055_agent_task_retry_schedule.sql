-- Private scheduling metadata only. Existing saved-task catalogue/read RPCs
-- remain unchanged, read-only and compatible with the previous deployment.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-agent-task-retry',0));

create table public.agent_pending_task_retries (
 task_id uuid primary key references public.agent_pending_tasks(uuid) on delete cascade,
 task_updated_at timestamptz not null,
 attempt_updated_at timestamptz not null,
 cycle_id uuid not null,
 attempted_at timestamptz not null,
 retry_at timestamptz not null,
 finalized_at timestamptz,
 outcome text not null check(outcome in ('attempted','completed','not_needed','pending','deferred','failed','timeout','stale','aborted','unavailable','forbidden','tool_failed','incomplete_batch','invalid_completion','invalid_tool_call','audit_unavailable','preflight_failed','context_limit','round_limit','call_limit','not_configured')),
 intent_hash text not null check(intent_hash ~ '^[a-f0-9]{32}$'),
 expires_at timestamptz not null,
 check(retry_at>=attempted_at and retry_at<=expires_at and expires_at>attempted_at),
 check(finalized_at is null or finalized_at>=attempted_at)
);
comment on table public.agent_pending_task_retries is
 'Service-only exact-version retry timing. No source content, task payloads or lease credentials. Cascades with the original temporary task; never extends its expiry.';
alter table public.agent_pending_task_retries enable row level security;
alter table public.agent_pending_task_retries force row level security;
revoke all on public.agent_pending_task_retries from public,anon,authenticated,service_role;

create function public.agent_pending_task_retry_catalogue(p_token uuid,p_allowed_source_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb; retries jsonb;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) then
  return jsonb_build_object('status','invalid_request');end if;
 if cardinality(p_allowed_source_ids)=0 then return jsonb_build_object('status','ready','retries','[]'::jsonb);end if;
 select data into runner from public.agent_automation_state where key='runner';
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'updatedAt',r.task_updated_at,
  'cycleId',r.cycle_id,'retryAt',r.retry_at,'finalizedAt',r.finalized_at,'outcome',r.outcome)
  order by r.task_id),'[]'::jsonb) into retries
 from public.agent_pending_task_retries r join public.agent_pending_tasks t on t.uuid=r.task_id
 where r.expires_at>clock_timestamp() and t.expires_at>clock_timestamp()
  and r.task_updated_at=t.updated_at and public.agent_pending_task_sources(t.info)<@p_allowed_source_ids;
 return jsonb_build_object('status','ready','retries',retries);
end $$;

create function public.agent_pending_task_retry(p_token uuid,p_allowed_source_ids uuid[],p_task_id uuid,
 p_expected_updated_at timestamptz,p_cycle_id uuid,p_action text,p_outcome text default null,
 p_checkpoint_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb; task public.agent_pending_tasks; previous public.agent_pending_task_retries;
 stamp timestamptz; fingerprint text; claimed_original boolean;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) or cardinality(p_allowed_source_ids)=0
  or p_task_id is null or p_expected_updated_at is null or p_cycle_id is null
  or p_action is null or p_action not in ('attempt','finish')
  or p_action='attempt' and (p_outcome is not null or p_checkpoint_updated_at is not null)
  or p_action='finish' and (p_outcome is null or p_outcome not in ('completed','not_needed','pending','deferred','failed','timeout','stale','aborted','unavailable','forbidden','tool_failed','incomplete_batch','invalid_completion','invalid_tool_call','audit_unavailable','preflight_failed','context_limit','round_limit','call_limit','not_configured'))
 then return jsonb_build_object('status','invalid_request');end if;
 -- Same lock order as task updates and queue settlement; never bypass a lost lease.
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 select * into task from public.agent_pending_tasks where uuid=p_task_id for update;
 if not found then return jsonb_build_object('status','not_found');end if;
 if not public.agent_pending_task_sources(task.info)<@p_allowed_source_ids then return jsonb_build_object('status','forbidden');end if;
 stamp:=clock_timestamp();
 if task.expires_at<=stamp then return jsonb_build_object('status','expired');end if;
 fingerprint:=md5(jsonb_build_object('inputs',task.info->'inputs','request',task.info->'request')::text);
 select * into previous from public.agent_pending_task_retries where task_id=p_task_id for update;
 if p_action='attempt' then
  if task.updated_at is distinct from p_expected_updated_at then return jsonb_build_object('status','conflict');end if;
  if found and previous.task_updated_at=task.updated_at and previous.cycle_id=p_cycle_id then
   return jsonb_build_object('status','ready');end if;
  -- A real original in this exact claim may make current-cycle work eligible.
  -- Use only the server-owned snapshot, not a caller-supplied override or a source fetch.
  select exists(select 1 from jsonb_array_elements(case when jsonb_typeof(task.info->'inputs')='array'
   then task.info->'inputs' else '[]'::jsonb end) i
   where runner->'snapshot' ? lower(i->>'uuid')
    and runner->'snapshot'->>lower(i->>'uuid')=md5((i->'raw_response')::text)
    and runner->'sources'->>lower(i->>'uuid')=i->'raw_response'->>'source_id') into claimed_original;
  if previous.task_updated_at=task.updated_at and previous.retry_at>stamp and not claimed_original then
   return jsonb_build_object('status','pending');end if;
  insert into public.agent_pending_task_retries(task_id,task_updated_at,attempt_updated_at,cycle_id,attempted_at,retry_at,outcome,intent_hash,expires_at)
   values(task.uuid,task.updated_at,task.updated_at,p_cycle_id,stamp,least(stamp+interval '5 minutes',task.expires_at),'attempted',fingerprint,task.expires_at)
  on conflict(task_id) do update set task_updated_at=excluded.task_updated_at,attempt_updated_at=excluded.attempt_updated_at,
   cycle_id=excluded.cycle_id,attempted_at=excluded.attempted_at,retry_at=excluded.retry_at,finalized_at=null,
   outcome=excluded.outcome,intent_hash=excluded.intent_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('status','ready');
 end if;
 if previous.task_id is null then return jsonb_build_object('status','not_found');end if;
 if previous.cycle_id is distinct from p_cycle_id or previous.attempt_updated_at is distinct from p_expected_updated_at
 then return jsonb_build_object('status','conflict');end if;
 -- Only an explicitly observed successful checkpoint of unchanged intent can
 -- forward scheduling to a new history-only version. Human/new-source edits win.
 if task.updated_at is distinct from previous.task_updated_at and
  (p_checkpoint_updated_at is distinct from task.updated_at or previous.intent_hash is distinct from fingerprint)
 then return jsonb_build_object('status','conflict');end if;
 if previous.finalized_at is not null then return jsonb_build_object('status','ready');end if;
 update public.agent_pending_task_retries set task_updated_at=task.updated_at,retry_at=least(stamp+interval '5 minutes',task.expires_at),
  finalized_at=stamp,outcome=p_outcome,expires_at=least(expires_at,task.expires_at) where task_id=task.uuid;
 return jsonb_build_object('status','ready');
end $$;

revoke all on function public.agent_pending_task_retry_catalogue(uuid,uuid[]),
 public.agent_pending_task_retry(uuid,uuid[],uuid,timestamptz,uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.agent_pending_task_retry_catalogue(uuid,uuid[]),
 public.agent_pending_task_retry(uuid,uuid[],uuid,timestamptz,uuid,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
