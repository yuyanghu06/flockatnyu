-- Applied001–006 remain immutable. Carry each authorized source name through
-- its calendar windows, so stale estimates cannot spool/replay full originals
-- once for every eligible source before canonicalization. Fingerprints, ranges,
-- current-week retention, source guards and the public return schema are unchanged.
create or replace function public.discord_summary_manifest(p_guild_id text,p_mode text default 'bootstrap',p_as_of timestamptz default now())
returns table(source_id uuid,channel_id text,tier text,period_key text,period_start timestamptz,period_end timestamptz,input_fingerprint text,message_count integer,segment_count integer,input_chars bigint,input_record_count integer,represented_message_count bigint,raw_message_count bigint,summary_input_count integer,ready boolean,cached_job_id uuid,inputs jsonb)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select c.source_id,c.channel_id,c.title channel_name,c.backfill_from,st.last_success_at from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.status='active'
  left join public.discord_sync_state st on st.source_id=c.source_id where c.guild_id=p_guild_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
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
 ), windows as (
  select source_id,channel_id,channel_name,tier,range_start,max(range_end) range_end from(select * from raw_windows union all select * from retained_windows) w group by source_id,channel_id,channel_name,tier,range_start
 ), cached as materialized (
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

revoke all on function public.discord_summary_manifest(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.discord_summary_manifest(text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
