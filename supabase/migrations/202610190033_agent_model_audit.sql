-- Private, bounded returned-output accounting for chat and autonomous planner.
-- No prompts, tool read responses, uploads or source-message archives belong here.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-agent-model-audit',0));
create table public.agent_model_calls (
 call_id uuid primary key,
 agent text not null check(agent in ('chat','planner')),
 run_id uuid not null,
 round integer check(round between 0 and 10000),
 provider text not null check(length(provider) between 1 and 160),
 model text not null check(length(model) between 1 and 160),
 operation text not null check(length(operation) between 1 and 160),
 stream boolean not null,
 provider_base_host text check(length(provider_base_host)<=253),
 requested_service_tier text check(length(requested_service_tier)<=64),
 service_tier text check(length(service_tier)<=64),
 status text not null default 'started' check(status in ('started','succeeded','failed','aborted','cancelled')),
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 expires_at timestamptz not null default (clock_timestamp()+interval '7 days'),
 response_id text check(length(response_id)<=256),
 provider_request_id text check(length(provider_request_id)<=256),
 http_status integer check(http_status between 100 and 599),
 stop_reason text check(length(stop_reason)<=128),
 error_code text check(length(error_code)<=128),
 usage jsonb,
 output jsonb check(output is null or jsonb_typeof(output)='object' and octet_length(output::text)<=614400),
 estimated_cost_usd numeric check(estimated_cost_usd>=0 and estimated_cost_usd<1000000),
 pricing_basis jsonb check(pricing_basis is null or jsonb_typeof(pricing_basis)='object' and octet_length(pricing_basis::text)<4096),
 check((status='started' and finished_at is null) or (status<>'started' and finished_at is not null)),
 check(expires_at>started_at and expires_at<=started_at+interval '7 days 1 second'),
 check((estimated_cost_usd is null)=(pricing_basis is null))
);
create index agent_model_calls_run on public.agent_model_calls(agent,run_id,started_at);
create index agent_model_calls_expiry on public.agent_model_calls(expires_at);
create index agent_model_calls_unresolved on public.agent_model_calls(started_at) where status='started';
create table public.agent_audit_events (
 event_id uuid primary key,
 agent text not null check(agent in ('chat','planner')),
 run_id uuid not null,
 round integer check(round between 0 and 10000),
 kind text not null check(kind in ('run_started','run_finished','tool_started','tool_finished')),
 tool text check(length(tool) between 1 and 160),
 status text not null check(length(status) between 1 and 64),
 duration_ms bigint check(duration_ms between 0 and 1000000000000),
 counts jsonb not null default '{}' check(jsonb_typeof(counts)='object' and octet_length(counts::text)<=4096),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '7 days'),
 check(expires_at>created_at and expires_at<=created_at+interval '7 days 1 second')
);
create index agent_audit_events_run on public.agent_audit_events(agent,run_id,created_at);
create index agent_audit_events_expiry on public.agent_audit_events(expires_at);
alter table public.agent_model_calls enable row level security;
alter table public.agent_model_calls force row level security;
alter table public.agent_audit_events enable row level security;
alter table public.agent_audit_events force row level security;
revoke all on public.agent_model_calls,public.agent_audit_events from public,anon,authenticated,service_role;
grant select on public.agent_model_calls,public.agent_audit_events to service_role;

create function public.agent_audit_start_model(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.agent_model_calls; p jsonb:=p_payload;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4096 or not(p ?& array['callId','agent','runId','provider','model','operation','stream'])
  or jsonb_typeof(p->'stream')<>'boolean' then raise check_violation using message='Invalid audit start';end if;
 insert into public.agent_model_calls(call_id,agent,run_id,round,provider,model,operation,stream,provider_base_host,requested_service_tier,service_tier)
 values((p->>'callId')::uuid,p->>'agent',(p->>'runId')::uuid,(p->>'round')::integer,p->>'provider',p->>'model',p->>'operation',(p->>'stream')::boolean,p->>'providerBaseHost',p->>'serviceTier',p->>'serviceTier')
 on conflict(call_id) do nothing;
 select * into strict r from public.agent_model_calls where call_id=(p->>'callId')::uuid;
 if r.expires_at<=clock_timestamp() or row(r.agent,r.run_id,r.round,r.provider,r.model,r.operation,r.stream,r.provider_base_host,r.requested_service_tier) is distinct from
 row(p->>'agent',(p->>'runId')::uuid,(p->>'round')::integer,p->>'provider',p->>'model',p->>'operation',(p->>'stream')::boolean,p->>'providerBaseHost',p->>'serviceTier')
 then raise check_violation using message='Audit identity conflict';end if;
 return jsonb_build_object('status','ready');
end $$;

create function public.agent_audit_finish_model(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.agent_model_calls;p jsonb:=p_payload; k text;v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>655360 or not(p ?& array['callId','agent','runId','status','usage','output'])
  or p->>'status' not in ('succeeded','failed','aborted','cancelled') or jsonb_typeof(p->'usage')<>'object'
 then raise check_violation using message='Invalid audit finish';end if;
 if (select count(*) from jsonb_object_keys(p->'usage'))<>5 then raise check_violation using message='Invalid audit usage';end if;
 for k,v in select * from jsonb_each(p->'usage') loop
  if k not in ('inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens') or
   (v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>1000000000000))
  then raise check_violation using message='Invalid audit usage';end if;
 end loop;
 select * into r from public.agent_model_calls where call_id=(p->>'callId')::uuid for update;
 if not found or r.expires_at<=clock_timestamp() or row(r.agent,r.run_id,r.round) is distinct from row(p->>'agent',(p->>'runId')::uuid,(p->>'round')::integer)
 then raise check_violation using message='Audit identity conflict';end if;
 -- Retry cannot rewrite a finished call, even with different returned output.
 if r.status<>'started' then return jsonb_build_object('status','ready');end if;
 if p->>'estimatedCostUsd' is not null and (r.provider not in ('openai','openai-compatible') or r.model<>'gpt-6-luna' or r.provider_base_host is distinct from 'api.openai.com' or coalesce(p->>'serviceTier',r.service_tier) not in ('default','standard'))
 then raise check_violation using message='Unknown audit pricing';end if;
 if p->>'estimatedCostUsd' is not null and (
  (p->'usage'->>'inputTokens') is null or (p->'usage'->>'outputTokens') is null or (p->'usage'->>'cacheReadTokens') is null
  or (p->'usage'->>'cacheReadTokens')::numeric>(p->'usage'->>'inputTokens')::numeric
  or coalesce((p->'usage'->>'cacheWriteTokens')::numeric,0)<>0
  or abs((p->>'estimatedCostUsd')::numeric-(((p->'usage'->>'inputTokens')::numeric-(p->'usage'->>'cacheReadTokens')::numeric)*0.10+(p->'usage'->>'cacheReadTokens')::numeric*0.01+(p->'usage'->>'outputTokens')::numeric*0.50)/1000000)>0.000000000001
  or p->'pricingBasis'->>'version' is distinct from '2026-10-19'
  or p->'pricingBasis'->>'source' is distinct from 'https://developers.openai.com/api/docs/models/gpt-6-luna')
 then raise check_violation using message='Invalid audit pricing';end if;
 update public.agent_model_calls set status=p->>'status',finished_at=clock_timestamp(),response_id=p->>'responseId',provider_request_id=p->>'providerRequestId',
  http_status=(p->>'httpStatus')::integer,stop_reason=p->>'stopReason',error_code=p->>'errorCode',usage=p->'usage',output=p->'output',
  estimated_cost_usd=(p->>'estimatedCostUsd')::numeric,pricing_basis=nullif(p->'pricingBasis','null'::jsonb),service_tier=coalesce(p->>'serviceTier',service_tier)
 where call_id=r.call_id;
 return jsonb_build_object('status','ready');
end $$;

create function public.agent_audit_record_event(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.agent_audit_events;p jsonb:=p_payload;k text;v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>8192 or not(p ?& array['eventId','agent','runId','kind','status','counts']) or jsonb_typeof(p->'counts')<>'object'
  or (select count(*) from jsonb_object_keys(p->'counts'))>32 then raise check_violation using message='Invalid audit event';end if;
 for k,v in select * from jsonb_each(p->'counts') loop
  if k !~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$' or jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or (v::text)::numeric>1000000000
  then raise check_violation using message='Invalid audit counts';end if;
 end loop;
 insert into public.agent_audit_events(event_id,agent,run_id,round,kind,tool,status,duration_ms,counts)
 values((p->>'eventId')::uuid,p->>'agent',(p->>'runId')::uuid,(p->>'round')::integer,p->>'kind',p->>'tool',p->>'status',(p->>'durationMs')::bigint,p->'counts') on conflict(event_id) do nothing;
 select * into strict r from public.agent_audit_events where event_id=(p->>'eventId')::uuid;
 if r.expires_at<=clock_timestamp() or row(r.agent,r.run_id,r.round,r.kind,r.tool,r.status,r.duration_ms,r.counts) is distinct from
 row(p->>'agent',(p->>'runId')::uuid,(p->>'round')::integer,p->>'kind',p->>'tool',p->>'status',(p->>'durationMs')::bigint,p->'counts')
 then raise check_violation using message='Audit event identity conflict';end if;
 return jsonb_build_object('status','ready');
end $$;

create function public.agent_audit_prune(p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 delete from public.agent_model_calls where call_id in (select call_id from public.agent_model_calls where expires_at<=clock_timestamp() order by expires_at limit 5000);
 delete from public.agent_audit_events where event_id in (select event_id from public.agent_audit_events where expires_at<=clock_timestamp() order by expires_at limit 5000);
 return jsonb_build_object('status','ready');
end $$;
revoke all on function public.agent_audit_start_model(jsonb),public.agent_audit_finish_model(jsonb),public.agent_audit_record_event(jsonb),public.agent_audit_prune(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.agent_audit_start_model(jsonb),public.agent_audit_finish_model(jsonb),public.agent_audit_record_event(jsonb),public.agent_audit_prune(jsonb) to service_role;
comment on table public.agent_model_calls is 'Private redacted model-returned outputs and nullable usage only. No prompts, tool read payloads or uploads. Server-controlled seven-day TTL; started records can remain unresolved after failures.';
comment on table public.agent_audit_events is 'Private content-free run/tool lifecycle metadata; no arguments or tool result bodies. Server-controlled seven-day TTL.';
notify pgrst,'reload schema';
commit;
