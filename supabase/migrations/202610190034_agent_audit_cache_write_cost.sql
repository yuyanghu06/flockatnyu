-- Include observed cache writes in known standard pricing; preserve prior audit data/ACLs.
-- prompt_tokens includes both cache read and cache write tokens. Unknown counters or
-- long-context inputs remain unpriced; this estimate is not a provider billing receipt.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-agent-model-audit',0));
create or replace function public.agent_audit_finish_model(p_payload jsonb) returns jsonb
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
  (p->'usage'->>'inputTokens') is null or (p->'usage'->>'outputTokens') is null or (p->'usage'->>'cacheReadTokens') is null or (p->'usage'->>'cacheWriteTokens') is null or (p->'usage'->>'inputTokens')::numeric>272000
  or (p->'usage'->>'cacheReadTokens')::numeric+(p->'usage'->>'cacheWriteTokens')::numeric>(p->'usage'->>'inputTokens')::numeric
  or abs((p->>'estimatedCostUsd')::numeric-(((p->'usage'->>'inputTokens')::numeric-(p->'usage'->>'cacheReadTokens')::numeric-(p->'usage'->>'cacheWriteTokens')::numeric)*0.10+(p->'usage'->>'cacheReadTokens')::numeric*0.01+(p->'usage'->>'cacheWriteTokens')::numeric*0.125+(p->'usage'->>'outputTokens')::numeric*0.50)/1000000)>0.000000000001
  or p->'pricingBasis'->>'version' is distinct from '2026-10-19'
  or p->'pricingBasis'->>'source' is distinct from 'https://developers.openai.com/api/docs/models/gpt-6-luna')
 then raise check_violation using message='Invalid audit pricing';end if;
 update public.agent_model_calls set status=p->>'status',finished_at=clock_timestamp(),response_id=p->>'responseId',provider_request_id=p->>'providerRequestId',
  http_status=(p->>'httpStatus')::integer,stop_reason=p->>'stopReason',error_code=p->>'errorCode',usage=p->'usage',output=p->'output',
  estimated_cost_usd=(p->>'estimatedCostUsd')::numeric,pricing_basis=nullif(p->'pricingBasis','null'::jsonb),service_tier=coalesce(p->>'serviceTier',service_tier)
 where call_id=r.call_id;
 return jsonb_build_object('status','ready');
end $$;
revoke all on function public.agent_audit_finish_model(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.agent_audit_finish_model(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
