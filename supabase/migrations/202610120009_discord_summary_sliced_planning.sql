-- REST planning must stay below the hosted60s request cap. Freeze a cheap
-- calendar queue, then canonicalize exactly one source/period per transaction.
alter table public.discord_summary_operations add column planning_complete boolean not null default true;
alter table public.discord_summary_operations add column planning_state jsonb not null default '{}';
-- Canonical equality remains the legacy identity. Sliced queue generations may
-- reach the same exact canonical digest (for example, a renamed closed cache).
do $$ declare constraint_name text;begin
 select c.conname into constraint_name from pg_constraint c where c.conrelid='public.discord_summary_operations'::regclass and c.contype='u'
 and array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum,ordinal) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.ordinal)=array['guild_id','policy_revision','provider','model','prompt_version','mode','due_identity','manifest_fingerprint'];
 if constraint_name is null then raise exception 'Missing legacy operation identity';end if;
 execute format('alter table public.discord_summary_operations drop constraint %I',constraint_name);
end $$;
create unique index discord_summary_operation_legacy_manifest_identity on public.discord_summary_operations(guild_id,policy_revision,provider,model,prompt_version,mode,due_identity,manifest_fingerprint) where not (planning_state ? 'queue_fingerprint');
create unique index discord_summary_operation_queue_identity on public.discord_summary_operations(guild_id,policy_revision,provider,model,prompt_version,mode,due_identity,(planning_state->>'queue_fingerprint')) where planning_state ? 'queue_fingerprint' and not coalesce((planning_state->>'stale')::boolean,false);
create function public.discord_summary_planning_queue(p_guild_id text,p_mode text,p_as_of timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select c.source_id,c.channel_id,c.title channel_name,c.backfill_from,st.last_success_at from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.status='active'
  left join public.discord_sync_state st on st.source_id=c.source_id where c.guild_id=p_guild_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
 ), bounds as (select date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' month_start,date_trunc('week',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' recent_from),
 raw_windows as materialized (
  select e.source_id,e.channel_id,e.channel_name,case when m.created_at<b.month_start then 'monthly' else 'weekly' end tier,
  case when m.created_at<b.month_start then date_trunc('month',m.created_at at time zone 'America/New_York') at time zone 'America/New_York' else greatest(date_trunc('week',m.created_at at time zone 'America/New_York') at time zone 'America/New_York',b.month_start) end range_start,
  case when m.created_at<b.month_start then least((date_trunc('month',m.created_at at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from)
  else least((date_trunc('week',m.created_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York',b.recent_from) end range_end,count(*)::bigint raw_count,encode(sha256(convert_to(string_agg(m.message_id||':'||extract(epoch from m.created_at)::text||':'||coalesce(extract(epoch from m.edited_at)::text,'')||':'||m.author_id||':'||coalesce(m.reply_to_message_id,'')||':'||m.content_hash,'|' order by m.created_at,m.message_id),'UTF8')),'hex') raw_identity
  from eligible e join public.discord_messages m on m.source_id=e.source_id and m.guild_id=p_guild_id and m.channel_id=e.channel_id cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and m.created_at<b.month_start and m.created_at<b.recent_from)
  or (p_mode in ('bootstrap','weekly') and m.created_at>=b.month_start and m.created_at<b.recent_from)
  group by 1,2,3,4,5,6
 ), retained_windows as (
  select e.source_id,e.channel_id,e.channel_name,case when l.range_end<=b.month_start then 'monthly' else 'weekly' end tier,
  case when l.range_end<=b.month_start then date_trunc('month',l.range_start at time zone 'America/New_York') at time zone 'America/New_York' else l.range_start end range_start,
  case when l.range_end<=b.month_start then least((date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from) else l.range_end end range_end
  from eligible e join public.discord_compaction_ledger l on l.source_id=e.source_id and l.active cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and l.range_end<=b.month_start and l.range_start<b.recent_from
  and (p_mode='bootstrap' or l.tier='weekly' or l.range_end<(date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York'))
  or (p_mode in ('bootstrap','weekly') and l.tier='weekly' and l.range_start>=b.month_start and l.range_end<=b.recent_from)
 ), windows as (
  select source_id,channel_id,channel_name,tier,range_start,max(range_end) range_end from(select source_id,channel_id,channel_name,tier,range_start,range_end from raw_windows union all select * from retained_windows) w group by source_id,channel_id,channel_name,tier,range_start
 ), cached as materialized (
  select w.*,j.id job_id from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.tier=w.tier and l.range_start=w.range_start and l.range_end=w.range_end
  join public.discord_summary_certificates cert on cert.id=l.certificate_id join public.discord_summary_jobs j on j.id=cert.job_id join public.discord_summary_results r on r.certificate_id=cert.id
  where cert.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex') and not exists(select 1 from public.discord_messages m where m.source_id=w.source_id and m.created_at>=w.range_start and m.created_at<w.range_end)
 ), child_metadata as materialized (
 select w.source_id,w.tier,w.range_start,count(*)::integer summary_count,sum(cert.represented_message_count)::bigint represented,
 encode(sha256(convert_to(string_agg(cert.id::text||':'||encode(sha256(convert_to(to_jsonb(cert)::text,'UTF8')),'hex')||':'||encode(sha256(convert_to(r.summary::text,'UTF8')),'hex')||':'||encode(sha256(convert_to(r.citations::text,'UTF8')),'hex'),'|' order by cert.range_start,cert.id),'UTF8')),'hex') child_identity
 from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.range_start>=w.range_start and l.range_end<=w.range_end
 join public.discord_summary_certificates cert on cert.id=l.certificate_id join public.discord_summary_results r on r.certificate_id=cert.id
 group by w.source_id,w.tier,w.range_start
 ), units as materialized (
 select w.*,e.backfill_from,coalesce(e.last_success_at>=w.range_end and e.backfill_from<=w.range_start,false) ready,
 coalesce(raw.raw_count,0)::bigint raw_count,coalesce(child.summary_count,0) summary_count,
 coalesce(raw.raw_count,0)+coalesce(child.represented,0) represented,coalesce(raw.raw_count,0)+coalesce(child.summary_count,0) input_count,
 raw.raw_identity,child.child_identity,cached.job_id cached_job_id
 from windows w join eligible e on e.source_id=w.source_id
 left join raw_windows raw on raw.source_id=w.source_id and raw.tier=w.tier and raw.range_start=w.range_start
 left join child_metadata child on child.source_id=w.source_id and child.tier=w.tier and child.range_start=w.range_start
 left join cached on cached.source_id=w.source_id and cached.tier=w.tier and cached.range_start=w.range_start
 ) select coalesce(jsonb_agg(jsonb_build_object('source_id',u.source_id,'channel_id',u.channel_id,'channel_name',u.channel_name,'tier',u.tier,'period_key',public.discord_summary_period_key(u.tier,u.range_start),'period_start',u.range_start,'period_end',u.range_end,'ready',case when j.id is not null then true else u.ready end,'backfill_from',u.backfill_from,
 'raw_identity',u.raw_identity,'child_identity',u.child_identity,'cached_job_id',j.id,'cached_fingerprint',j.input_fingerprint,
 'input_record_count',coalesce(j.input_record_count,u.input_count),'represented_message_count',coalesce(j.represented_message_count,u.represented),'raw_message_count',coalesce(j.raw_message_count,u.raw_count),'summary_input_count',coalesce(j.summary_input_count,u.summary_count)) order by u.source_id,u.tier,public.discord_summary_period_key(u.tier,u.range_start)),'[]')
 from units u left join public.discord_summary_jobs j on j.id=u.cached_job_id where u.input_count>0 or j.id is not null;
$$;

create function public.discord_summary_period_manifest(p_guild_id text,p_mode text,p_as_of timestamptz,p_source_id uuid,p_tier text,p_period_start timestamptz,p_period_end timestamptz)
returns table(source_id uuid,channel_id text,tier text,period_key text,period_start timestamptz,period_end timestamptz,input_fingerprint text,message_count integer,segment_count integer,input_chars bigint,input_record_count integer,represented_message_count bigint,raw_message_count bigint,summary_input_count integer,ready boolean,cached_job_id uuid,inputs jsonb)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select c.source_id,c.channel_id,c.title channel_name,c.backfill_from,st.last_success_at from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.status='active'
  left join public.discord_sync_state st on st.source_id=c.source_id where c.guild_id=p_guild_id and c.source_id=p_source_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
 ), bounds as (select date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' month_start,date_trunc('week',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' recent_from),
 raw_windows as (
  select distinct e.source_id,e.channel_id,e.channel_name,case when m.created_at<b.month_start then 'monthly' else 'weekly' end tier,
  case when m.created_at<b.month_start then date_trunc('month',m.created_at at time zone 'America/New_York') at time zone 'America/New_York' else greatest(date_trunc('week',m.created_at at time zone 'America/New_York') at time zone 'America/New_York',b.month_start) end range_start,
  case when m.created_at<b.month_start then least((date_trunc('month',m.created_at at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from)
  else least((date_trunc('week',m.created_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York',b.recent_from) end range_end
  from eligible e join public.discord_messages m on m.source_id=e.source_id and m.guild_id=p_guild_id and m.channel_id=e.channel_id cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and m.created_at<b.month_start and m.created_at<b.recent_from)
  or (p_mode in ('bootstrap','weekly') and m.created_at>=b.month_start and m.created_at<b.recent_from)
 ), retained_windows as (
  select e.source_id,e.channel_id,e.channel_name,case when l.range_end<=b.month_start then 'monthly' else 'weekly' end tier,
  case when l.range_end<=b.month_start then date_trunc('month',l.range_start at time zone 'America/New_York') at time zone 'America/New_York' else l.range_start end range_start,
  case when l.range_end<=b.month_start then least((date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from) else l.range_end end range_end
  from eligible e join public.discord_compaction_ledger l on l.source_id=e.source_id and l.active cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and l.range_end<=b.month_start and l.range_start<b.recent_from
  and (p_mode='bootstrap' or l.tier='weekly' or l.range_end<(date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York'))
  or (p_mode in ('bootstrap','weekly') and l.tier='weekly' and l.range_start>=b.month_start and l.range_end<=b.recent_from)
 ), windows_all as (
  select source_id,channel_id,channel_name,tier,range_start,max(range_end) range_end from(select * from raw_windows union all select * from retained_windows) w group by source_id,channel_id,channel_name,tier,range_start
 ), windows as materialized (select * from windows_all where tier=p_tier and range_start=p_period_start and range_end=p_period_end), cached as materialized (
  select w.*,j.id job_id from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.tier=w.tier and l.range_start=w.range_start and l.range_end=w.range_end
  join public.discord_summary_certificates cert on cert.id=l.certificate_id join public.discord_summary_jobs j on j.id=cert.job_id join public.discord_summary_results r on r.certificate_id=cert.id
  where cert.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex') and not exists(select 1 from public.discord_messages m where m.source_id=w.source_id and m.created_at>=w.range_start and m.created_at<w.range_end)
 ), records as materialized (
  select w.*,m.message_id input_id,'raw' kind,m.created_at ordered_at,1::bigint represented,array[m.message_id] citation_ids,m.message_id raw_id,null::uuid certificate_id,
   public.discord_summary_input(m,w.channel_name)||jsonb_build_object('inputId',m.message_id,'kind','raw','representedMessageCount',1,'citationMessageIds',jsonb_build_array(m.message_id)) canonical
  from windows w join public.discord_messages m on m.source_id=w.source_id and m.guild_id=p_guild_id and m.channel_id=w.channel_id and m.created_at>=w.range_start and m.created_at<w.range_end
  where not exists(select 1 from cached c where c.source_id=w.source_id and c.tier=w.tier and c.range_start=w.range_start)
  union all
  select w.*,'summary:'||c.id,'verified_summary',c.range_start,c.represented_message_count,public.discord_summary_citation_ids(r.summary),null,c.id,public.discord_summary_verified_input(c.id)
  from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.range_start>=w.range_start and l.range_end<=w.range_end
  join public.discord_summary_certificates c on c.id=l.certificate_id join public.discord_summary_results r on r.certificate_id=c.id
  where not exists(select 1 from cached ca where ca.source_id=w.source_id and ca.tier=w.tier and ca.range_start=w.range_start)
 ), measured as (
  select r.*,encode(sha256(convert_to(r.canonical::text,'UTF8')),'hex') row_hash,greatest(1,(length(r.canonical::text)+7999)/8000) segments from records r
 -- Do not let an underestimated eligible-source join rerun this expensive
 -- canonical/digest/JSON aggregation once for every source on fresh statistics.
 ), manifests as materialized (
  select r.source_id,r.channel_id,r.tier,public.discord_summary_period_key(r.tier,r.range_start) period_key,r.range_start,r.range_end,
  encode(sha256(convert_to(string_agg(r.input_id||':'||r.row_hash,'|' order by r.ordered_at,r.input_id),'UTF8')),'hex') fingerprint,
  count(*)::integer record_count,sum(r.represented) represented,sum(r.segments)::integer segments,sum(length(r.canonical::text)) chars,
  count(*) filter(where r.kind='raw')::bigint raw_count,count(*) filter(where r.kind='verified_summary')::integer summary_count,
  jsonb_agg(jsonb_build_object('inputId',r.input_id,'kind',r.kind,'inputHash',r.row_hash,'segmentCount',r.segments,'inputChars',length(r.canonical::text),'representedMessageCount',r.represented,'citationMessageIds',to_jsonb(r.citation_ids),'rawMessageId',r.raw_id,'certificateId',r.certificate_id,'rangeStart',r.ordered_at,'rangeEnd',case when r.kind='verified_summary' then (r.canonical->>'rangeEnd')::timestamptz else r.ordered_at end) order by r.ordered_at,r.input_id) input_refs
  from measured r group by r.source_id,r.channel_id,r.tier,r.range_start,r.range_end
 ) select m.source_id,m.channel_id,m.tier,m.period_key,m.range_start,m.range_end,m.fingerprint,m.represented::integer,m.segments,m.chars,m.record_count,m.represented,m.raw_count,m.summary_count,
 coalesce(e.last_success_at>=m.range_end and e.backfill_from<=m.range_start,false),null::uuid,m.input_refs from manifests m join eligible e on e.source_id=m.source_id
 union all select c.source_id,c.channel_id,c.tier,j.period_key,c.range_start,c.range_end,j.input_fingerprint,j.message_count,j.segment_count,j.input_chars,j.input_record_count,j.represented_message_count,j.raw_message_count,j.summary_input_count,true,j.id,'[]'::jsonb from cached c join public.discord_summary_jobs j on j.id=c.job_id;
$$;

create function public.discord_summary_queue_waits(p_guild_id text,p_mode text,p_as_of timestamptz,p_queue jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
 with units as(select value from jsonb_array_elements(p_queue)),waiting as materialized(
 select (value->>'source_id')::uuid source_id from units where not (value->>'ready')::boolean union select public.discord_summary_waiting_sources(p_guild_id,p_mode,p_as_of))
 select jsonb_build_object('waiting_source_count',(select count(*) from waiting),'blocked_group_count',(select count(*) from units where not (value->>'ready')::boolean)+(select count(*) from waiting w where not exists(select 1 from units u where (u.value->>'source_id')::uuid=w.source_id and not (u.value->>'ready')::boolean)));
$$;
create or replace function public.discord_summary_get_operation(p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;counts jsonb;begin
 select * into op from public.discord_summary_operations where id=p_operation_id;
 select * into p from public.discord_guild_policies where guild_id=op.guild_id for share;
 if op.id is null or p.paused or p.revision is distinct from op.policy_revision then raise serialization_failure using message='Stale operation';end if;
 select jsonb_build_object('succeeded',count(*) filter(where j.status='succeeded'),'pending',count(*) filter(where j.status='pending'),'running',count(*) filter(where j.status='running'),'failed',count(*) filter(where j.status='failed'),'stale',count(*) filter(where j.status='stale'),'complete',op.planning_complete and not coalesce((op.planning_state->>'stale')::boolean,false) and count(*)=op.total_jobs and count(*) filter(where j.status='succeeded')=op.total_jobs) into counts from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=op.id;
 return (to_jsonb(op)-'planning_state')||counts||jsonb_build_object('planning_cursor',coalesce((op.planning_state->>'cursor')::integer,op.total_jobs),'planning_total',coalesce((op.planning_state->>'total')::integer,op.total_jobs),'planning_stale',coalesce((op.planning_state->>'stale')::boolean,false) or (counts->>'stale')::integer>0);
end $$;
create or replace function public.discord_summary_preview(p_guild_id text,p_provider text,p_model text,p_prompt_version text,p_mode text default 'bootstrap',p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='60s' set work_mem='16MB' as $$
declare p public.discord_guild_policies;queue jsonb;waits jsonb;result jsonb;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused then raise serialization_failure using message='Stale policy';end if;
 if p_mode not in ('bootstrap','weekly','monthly') or p_as_of is null or p_as_of>now()+interval '5 minutes' then raise check_violation using message='Invalid retention mode';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 if not exists(select 1 from public.discord_discovery_state d where d.guild_id=p_guild_id and d.policy_revision=p.revision and d.state->>'phase'='complete') then
  return jsonb_build_object('guild_id',p_guild_id,'policy_revision',p.revision,'mode',p_mode,'as_of',p_as_of,'group_count',0,'message_count',0,'input_record_count',0,'segment_count',null,'input_chars',null,'cached_count',0,'waiting_source_count',(select count(*) from public.discord_channels c where c.guild_id=p_guild_id and c.enabled),'blocked_group_count',1,'discovery_pending',true,'estimate_kind','metadata_only');end if;
 queue:=public.discord_summary_planning_queue(p_guild_id,p_mode,p_as_of);waits:=public.discord_summary_queue_waits(p_guild_id,p_mode,p_as_of,queue);
 select jsonb_build_object('guild_id',p_guild_id,'policy_revision',p.revision,'mode',p_mode,'as_of',p_as_of,'group_count',count(*) filter(where (v->>'ready')::boolean),'message_count',coalesce(sum((v->>'represented_message_count')::bigint) filter(where (v->>'ready')::boolean),0),'input_record_count',coalesce(sum((v->>'input_record_count')::bigint) filter(where (v->>'ready')::boolean),0),'segment_count',null,'input_chars',null,'cached_count',count(*) filter(where v->>'cached_job_id' is not null),'estimate_kind','metadata_only') into result from jsonb_array_elements(queue) v;
 return result||waits;
end $$;
create or replace function public.discord_summary_begin_operation(p_guild_id text,p_expected_revision bigint,p_provider text,p_model text,p_prompt_version text,p_max_cost_usd numeric default 5,p_max_requests integer default 10000,p_mode text default 'bootstrap',p_as_of timestamptz default now(),p_due_identity text default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='60s' set work_mem='16MB' as $$
declare p public.discord_guild_policies;queue jsonb;waits jsonb;queue_fp text;op public.discord_summary_operations;due text;n integer;new_state jsonb;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused or p.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy';end if;
 if p_mode not in ('bootstrap','weekly','monthly') or p_as_of is null or p_as_of>now()+interval '5 minutes' or p_provider is null or length(p_provider) not between 1 and 100 or p_model is null or length(p_model) not between 1 and 200 or p_prompt_version is null or length(p_prompt_version) not between 1 and 100 or p_max_cost_usd is null or p_max_cost_usd<=0 or p_max_cost_usd>5 or p_max_requests is null or p_max_requests not between 1 and 10000 then raise check_violation using message='Invalid operation';end if;
 due:=coalesce(p_due_identity,p_mode||':'||p_as_of::text);if length(due)>200 then raise check_violation using message='Invalid due identity';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 if not exists(select 1 from public.discord_discovery_state d where d.guild_id=p_guild_id and d.policy_revision=p.revision and d.state->>'phase'='complete') then return jsonb_build_object('status','wait_for_sync','waiting_source_count',(select count(*) from public.discord_channels c where c.guild_id=p_guild_id and c.enabled),'blocked_group_count',1,'discovery_pending',true);end if;
 queue:=public.discord_summary_planning_queue(p_guild_id,p_mode,p_as_of);waits:=public.discord_summary_queue_waits(p_guild_id,p_mode,p_as_of,queue);
 if (waits->>'blocked_group_count')::integer>0 then return waits||jsonb_build_object('status','wait_for_sync');end if;
 n:=jsonb_array_length(queue);if n>10000 or octet_length(queue::text)>16000000 then raise check_violation using message='Planning queue exceeds bounded capacity';end if;
 queue_fp:=encode(sha256(convert_to(queue::text,'UTF8')),'hex');
 new_state:=jsonb_build_object('version','sliced-v1','queue',queue,'queue_fingerprint',queue_fp,'cursor',0,'total',n,'segment_count',0,'input_chars',0);
 -- A changed frozen plan cannot open a second allowance under the same due
 -- identity. Replan the charged operation itself, retaining every reservation,
 -- cap and accounting counter. Only its disposable manifest links are replaced.
 select o.* into op from public.discord_summary_operations o where o.guild_id=p_guild_id and o.policy_revision=p.revision and o.provider=p_provider and o.model=p_model and o.prompt_version=p_prompt_version and o.mode=p_mode and o.due_identity=due and o.as_of=p_as_of and (o.request_count>0 or o.allocated_usd>0 or o.spent_usd>0) order by o.created_at limit 1 for update;
 if op.id is not null then
  if coalesce((op.planning_state->>'stale')::boolean,false) or op.planning_state->>'queue_fingerprint' is distinct from queue_fp or exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=op.id and j.status='stale') then
   update public.discord_summary_operations o set planning_state=o.planning_state||jsonb_build_object('stale',true),updated_at=now() where o.id<>op.id and o.guild_id=p_guild_id and o.policy_revision=p.revision and o.provider=p_provider and o.model=p_model and o.prompt_version=p_prompt_version and o.mode=p_mode and o.due_identity=due and o.request_count=0 and o.allocated_usd=0 and o.spent_usd=0;
   delete from public.discord_summary_operation_jobs where operation_id=op.id;
   update public.discord_summary_operations set planning_state=new_state,planning_complete=n=0,total_jobs=n,manifest_fingerprint=case when n=0 then encode(sha256(convert_to('','UTF8')),'hex') else queue_fp end,updated_at=now() where id=op.id;
  end if;
  return public.discord_summary_get_operation(op.id);
 end if;
 -- Retiring an unpaid poisoned generation preserves its history while releasing
 -- the active queue identity. Payload-only edits deliberately leave the cheap
 -- queue digest unchanged; linked stale jobs still force a fresh canonical pass.
 update public.discord_summary_operations o set planning_state=o.planning_state||jsonb_build_object('stale',true),updated_at=now()
 where o.guild_id=p_guild_id and o.policy_revision=p.revision and o.provider=p_provider and o.model=p_model and o.prompt_version=p_prompt_version and o.mode=p_mode and o.due_identity=due and o.request_count=0 and o.allocated_usd=0 and o.spent_usd=0
 and (coalesce((o.planning_state->>'stale')::boolean,false) or o.planning_state->>'queue_fingerprint' is distinct from queue_fp or exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=o.id and j.status='stale'));
 insert into public.discord_summary_operations(guild_id,policy_revision,provider,model,prompt_version,mode,as_of,due_identity,manifest_fingerprint,total_jobs,max_cost_usd,max_requests,planning_complete,planning_state)
 values(p_guild_id,p.revision,p_provider,p_model,p_prompt_version,p_mode,p_as_of,due,case when n=0 then encode(sha256(convert_to('','UTF8')),'hex') else queue_fp end,n,p_max_cost_usd,p_max_requests,n=0,new_state) on conflict do nothing;
 select * into op from public.discord_summary_operations where guild_id=p_guild_id and policy_revision=p.revision and provider=p_provider and model=p_model and prompt_version=p_prompt_version and mode=p_mode and due_identity=due and planning_state->>'queue_fingerprint'=queue_fp and not coalesce((planning_state->>'stale')::boolean,false) order by created_at limit 1 for update;
 if op.id is null then raise serialization_failure using message='Operation identity conflict';end if;
 if op.as_of is distinct from p_as_of then raise serialization_failure using message='Operation snapshot changed';end if;
 return public.discord_summary_get_operation(op.id);
end $$;
create function public.discord_summary_prepare_operation(p_operation_id uuid,p_expected_cursor integer)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='55s' set work_mem='16MB' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;unit jsonb;item record;sid uuid;cursor integer;queue jsonb;waits jsonb;fp text;segments bigint;chars bigint;begin
 select * into op from public.discord_summary_operations where id=p_operation_id;
 select * into p from public.discord_guild_policies where guild_id=op.guild_id for share;
 if op.id is null or p.paused or p.revision is distinct from op.policy_revision then raise serialization_failure using message='Stale operation';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||op.guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||op.guild_id));
 if not exists(select 1 from public.discord_discovery_state d where d.guild_id=op.guild_id and d.policy_revision=p.revision and d.state->>'phase'='complete') then raise serialization_failure using message='Incomplete discovery';end if;
 select * into op from public.discord_summary_operations where id=p_operation_id for update;
 cursor:=coalesce((op.planning_state->>'cursor')::integer,op.total_jobs);
 if p_expected_cursor is null or p_expected_cursor<>cursor or coalesce((op.planning_state->>'stale')::boolean,false) then raise serialization_failure using message='Stale planning cursor';end if;
 if op.planning_complete then return jsonb_build_object('planned_groups',0,'operation',public.discord_summary_get_operation(op.id));end if;
 begin -- rollback a failed slice before marking only the draft stale
 unit:=op.planning_state->'queue'->cursor;
 if unit is null then raise check_violation using message='Missing planning unit';end if;
 perform pg_advisory_xact_lock(hashtext(unit->>'source_id'));
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id join public.discord_sync_state st on st.source_id=c.source_id
 where c.source_id=(unit->>'source_id')::uuid and c.guild_id=op.guild_id and c.channel_id=unit->>'channel_id' and c.title=unit->>'channel_name' and c.enabled and s.status='active' and (unit->>'cached_job_id' is not null or c.backfill_from<=(unit->>'period_start')::timestamptz and st.last_success_at>=(unit->>'period_end')::timestamptz) and public.discord_channel_allowed(c.guild_id,c.channel_id) for share of c,s,st;
 if not found then raise serialization_failure using message='Stale source';end if;
 select * into item from public.discord_summary_period_manifest(op.guild_id,op.mode,op.as_of,(unit->>'source_id')::uuid,unit->>'tier',(unit->>'period_start')::timestamptz,(unit->>'period_end')::timestamptz);
 if item.source_id is null or not item.ready or item.input_fingerprint is null or item.input_record_count<>(unit->>'input_record_count')::integer or item.represented_message_count<>(unit->>'represented_message_count')::bigint or item.raw_message_count<>(unit->>'raw_message_count')::bigint or item.summary_input_count<>(unit->>'summary_input_count')::integer or item.cached_job_id is distinct from (unit->>'cached_job_id')::uuid then raise serialization_failure using message='Planning unit changed';end if;
 if item.cached_job_id is not null then sid:=item.cached_job_id;
 else
 insert into public.discord_summary_jobs(source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,input_fingerprint,message_count,segment_count,input_chars,input_record_count,represented_message_count,raw_message_count,summary_input_count,provider,model,prompt_version,policy_revision)
 values(item.source_id,op.guild_id,item.channel_id,unit->>'channel_name',item.tier,item.period_key,item.period_start,item.period_end,item.input_fingerprint,item.message_count,item.segment_count,item.input_chars,item.input_record_count,item.represented_message_count,item.raw_message_count,item.summary_input_count,op.provider,op.model,op.prompt_version,p.revision)
 on conflict(source_id,tier,period_key,input_fingerprint,provider,model,prompt_version) do update set policy_revision=excluded.policy_revision,status=case when discord_summary_jobs.status='stale' or discord_summary_jobs.policy_revision<>excluded.policy_revision then 'pending' else discord_summary_jobs.status end,updated_at=now() returning id into sid;
 insert into public.discord_summary_inputs(job_id,input_id,kind,source_id,ordinal,input_hash,segment_count,input_chars,represented_message_count,citation_message_ids,raw_message_id,certificate_id,range_start,range_end)
 select sid,v->>'inputId',v->>'kind',item.source_id,ordinality::integer,v->>'inputHash',(v->>'segmentCount')::integer,(v->>'inputChars')::integer,(v->>'representedMessageCount')::bigint,array(select jsonb_array_elements_text(v->'citationMessageIds')),v->>'rawMessageId',(v->>'certificateId')::uuid,(v->>'rangeStart')::timestamptz,(v->>'rangeEnd')::timestamptz from jsonb_array_elements(item.inputs) with ordinality vals(v,ordinality) on conflict(job_id,input_id) do nothing;
 end if;
 insert into public.discord_summary_operation_jobs(operation_id,job_id,guild_id,ordinal) values(op.id,sid,op.guild_id,cursor+1);
 cursor:=cursor+1;op.planning_state:=op.planning_state||jsonb_build_object('cursor',cursor,'segment_count',coalesce((op.planning_state->>'segment_count')::bigint,0)+item.segment_count,'input_chars',coalesce((op.planning_state->>'input_chars')::bigint,0)+item.input_chars);
 if cursor=op.total_jobs then
 queue:=public.discord_summary_planning_queue(op.guild_id,op.mode,op.as_of);waits:=public.discord_summary_queue_waits(op.guild_id,op.mode,op.as_of,queue);
 if encode(sha256(convert_to(queue::text,'UTF8')),'hex') is distinct from op.planning_state->>'queue_fingerprint' or (waits->>'blocked_group_count')::integer>0 or exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=op.id and j.status='stale') then raise serialization_failure using message='Frozen planning manifest changed';end if;
 select encode(sha256(convert_to(coalesce(string_agg(j.source_id::text||':'||j.tier||':'||j.period_key||':'||j.input_fingerprint,'|' order by j.source_id,j.tier,j.period_key),''),'UTF8')),'hex'),sum(j.segment_count),sum(j.input_chars) into fp,segments,chars from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=op.id;
 if (select count(*) from public.discord_summary_operation_jobs where operation_id=op.id)<>op.total_jobs then raise check_violation using message='Incomplete planning coverage';end if;
 op.manifest_fingerprint:=fp;op.planning_complete:=true;op.planning_state:=op.planning_state||jsonb_build_object('segment_count',segments,'input_chars',chars);
 end if;
 update public.discord_summary_operations set planning_state=op.planning_state,planning_complete=op.planning_complete,manifest_fingerprint=op.manifest_fingerprint,updated_at=now() where id=op.id;
 return jsonb_build_object('planned_groups',1,'operation',public.discord_summary_get_operation(op.id));
 exception when serialization_failure then
 update public.discord_summary_operations set planning_state=planning_state||jsonb_build_object('stale',true),updated_at=now() where id=p_operation_id;
 return jsonb_build_object('status','stale','planned_groups',0,'operation',public.discord_summary_get_operation(p_operation_id));
 end;
end $$;

create or replace function public.discord_summary_lock_job(p_job_id uuid,p_lease_token uuid)
returns public.discord_summary_jobs language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;p public.discord_guild_policies;op public.discord_summary_operations;begin
 select * into j from public.discord_summary_jobs where id=p_job_id;
 select * into p from public.discord_guild_policies where guild_id=j.guild_id for share;
 if p.guild_id is null or p.paused or p.revision is distinct from j.policy_revision then raise serialization_failure using message='Stale policy';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||j.guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||j.guild_id));
 perform pg_advisory_xact_lock(hashtext(j.source_id::text));
 select * into op from public.discord_summary_operations where id=j.operation_id for update;
 select * into j from public.discord_summary_jobs where id=p_job_id for update;
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' and c.title=j.channel_name for share of c,s;
 if not found then raise serialization_failure using message='Inactive source';end if;
 if op.id is null or not op.planning_complete or coalesce((op.planning_state->>'stale')::boolean,false) or exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs stale_job on stale_job.id=oj.job_id where oj.operation_id=op.id and stale_job.status='stale') or not exists(select 1 from public.discord_summary_operation_jobs oj where oj.operation_id=op.id and oj.job_id=j.id) or op.guild_id<>j.guild_id or op.policy_revision<>p.revision or j.policy_revision<>p.revision or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() or not public.discord_channel_allowed(j.guild_id,j.channel_id) then raise serialization_failure using message='Stale lease';end if;
 update public.discord_summary_jobs set lease_expires_at=now()+j.lease_seconds*interval '1 second',updated_at=now() where id=j.id returning * into j;
 return j;
end $$;

create or replace function public.discord_summary_claim_job(p_operation_id uuid,p_owner_id text,p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;j public.discord_summary_jobs;begin
 select * into op from public.discord_summary_operations where id=p_operation_id;
 select * into p from public.discord_guild_policies where guild_id=op.guild_id for share;
 if op.id is null or p.paused or p.revision is distinct from op.policy_revision then raise serialization_failure using message='Stale operation';end if;
 if p_owner_id is null or length(p_owner_id) not between 1 and 128 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise check_violation using message='Invalid lease';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||op.guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||op.guild_id));
 select * into op from public.discord_summary_operations where id=p_operation_id for update;
 if not op.planning_complete then return jsonb_build_object('status','planning_required');end if;
 if coalesce((op.planning_state->>'stale')::boolean,false) or exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs stale_job on stale_job.id=oj.job_id where oj.operation_id=op.id and stale_job.status='stale') then
  update public.discord_summary_operations set planning_state=planning_state||jsonb_build_object('stale',true),updated_at=now() where id=op.id;
  return jsonb_build_object('status','stale');end if;
 -- A claim may finish already-cached parts without another paid request.
 -- Only reserve_request gates dispatch against the durable operation budget.
 select j1.* into j from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j1 on j1.id=oj.job_id
 where oj.operation_id=op.id and j1.policy_revision=p.revision and (j1.status in ('pending','failed') or j1.status='running' and j1.lease_expires_at<=now()) and j1.failure_count<10
 order by oj.ordinal for update of j1 skip locked limit 1;
 if j.id is null then return null;end if;
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' for share of c,s;
 if not found then update public.discord_summary_jobs set status='stale',lease_token=null,updated_at=now() where id=j.id;return jsonb_build_object('status','stale');end if;
 if not public.discord_channel_allowed(j.guild_id,j.channel_id) or public.discord_summary_current_fingerprint(j.id) is distinct from j.input_fingerprint then
  update public.discord_summary_jobs set status='stale',lease_token=null,updated_at=now() where id=j.id;return jsonb_build_object('status','stale');
 end if;
 update public.discord_summary_jobs set status='running',operation_id=op.id,lease_token=gen_random_uuid(),lease_owner=p_owner_id,lease_seconds=p_lease_seconds,lease_expires_at=now()+p_lease_seconds*interval '1 second',attempts=attempts+1,error_code=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create or replace function public.discord_summary_get_pending_operation(p_guild_id text,p_provider text,p_model text,p_prompt_version text,p_mode text default null,p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused then raise serialization_failure using message='Stale policy';end if;
 select o.* into op from public.discord_summary_operations o where o.guild_id=p_guild_id and o.policy_revision=p.revision and o.provider=p_provider and o.model=p_model and o.prompt_version=p_prompt_version and (p_mode is null or o.mode=p_mode)
 -- Charged stale plans remain discoverable outside the schedule gate. The
 -- caller replans using this operation's frozen identity and original caps.
 and (((o.request_count>0 or o.allocated_usd>0 or o.spent_usd>0) and (coalesce((o.planning_state->>'stale')::boolean,false) or exists(select 1 from public.discord_summary_operation_jobs stale_link join public.discord_summary_jobs stale_job on stale_job.id=stale_link.job_id where stale_link.operation_id=o.id and stale_job.status='stale')))
 or (not coalesce((o.planning_state->>'stale')::boolean,false)
 and not exists(select 1 from public.discord_summary_operation_jobs stale_link join public.discord_summary_jobs stale_job on stale_job.id=stale_link.job_id where stale_link.operation_id=o.id and stale_job.status='stale')
 and (not o.planning_complete or (o.planning_complete and exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=o.id and j.status in ('pending','running','failed') and j.failure_count<10 and public.discord_channel_allowed(j.guild_id,j.channel_id)
 and exists(select 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' and c.title=j.channel_name)
 and (j.tier='monthly' or j.period_start>=date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York')
 and not exists(select 1 from public.discord_compaction_ledger l where l.source_id=j.source_id and l.active and l.tier='monthly' and l.range_start<=j.period_start and l.range_end>=j.period_end))))))
 order by case when o.mode='monthly' then 0 else 1 end,o.created_at limit 1;if op.id is null then return null;end if;return public.discord_summary_get_operation(op.id);
end $$;

-- New planning helpers have the same service-only boundary as existing summaries.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'discord_summary_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);execute format('grant execute on function %s to service_role',fn.signature);end loop;
end $$;
notify pgrst,'reload schema';
