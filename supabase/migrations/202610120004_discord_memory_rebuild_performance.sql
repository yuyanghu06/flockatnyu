-- Follow-up to already-applied M18 migration. Preserve the same policy gate,
-- transaction locks and calendar periods while doing source checks once per
-- source and publishing bucket counts/membership from one materialized scan.
create or replace function public.discord_rebuild_memory(p_guild_id text,p_expected_revision bigint,p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; buckets bigint; members bigint;
 recent_from timestamptz; month_start timestamp; month_start_instant timestamptz;
begin
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for share;
 if policy.guild_id is null or policy.paused or policy.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy'; end if;
 if p_as_of is null or p_as_of>now()+interval '5 minutes' then raise check_violation using message='Invalid memory time'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-memory:'||p_guild_id));
 recent_from:=p_as_of-interval '168 hours';
 month_start:=date_trunc('month',p_as_of at time zone 'America/New_York');
 month_start_instant:=month_start at time zone 'America/New_York';
 delete from public.discord_memory_buckets b using public.discord_channels c where b.source_id=c.source_id and c.guild_id=p_guild_id;

 with eligible_sources as materialized (
  select c.source_id,c.channel_id from public.discord_channels c
  join public.knowledge_sources s on s.id=c.source_id and s.status='active'
  where c.guild_id=p_guild_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
 ), inputs as (
  select m.message_id,m.source_id,m.guild_id,m.created_at,
   m.created_at at time zone 'America/New_York' local_created
  from eligible_sources e join public.discord_messages m on m.source_id=e.source_id
  where m.created_at<p_as_of and m.guild_id=p_guild_id and m.channel_id=e.channel_id
 ), tiers as (
  select i.*,case when i.created_at>=recent_from then 'daily'
   when i.local_created>=month_start then 'weekly' else 'monthly' end tier from inputs i
 ), classified as materialized (
  -- These expressions exactly match discord_memory_period; using them here
  -- avoids a separate SQL-function execution for every individual message.
  select t.message_id,t.source_id,t.guild_id,t.tier,gen_random_uuid() candidate_bucket_id,
   case when t.tier='daily' then greatest(date_trunc('day',t.local_created) at time zone 'America/New_York',recent_from)
    when t.tier='weekly' then greatest(date_trunc('week',t.local_created) at time zone 'America/New_York',month_start_instant)
    else date_trunc('month',t.local_created) at time zone 'America/New_York' end period_start,
   case when t.tier='daily' then least((date_trunc('day',t.local_created)+interval '1 day') at time zone 'America/New_York',p_as_of)
    when t.tier='weekly' then least((date_trunc('week',t.local_created)+interval '7 days') at time zone 'America/New_York',recent_from)
    else least((date_trunc('month',t.local_created)+interval '1 month') at time zone 'America/New_York',recent_from) end period_end
  from tiers t
 ), assigned as materialized (
  -- Choose one stored random UUID for each group before writing either table.
  -- There is no message-to-group join whose cardinality can be underestimated
  -- after fresh ingestion. The volatile UUID is materialized before the window.
  select c.*,first_value(c.candidate_bucket_id) over(
   partition by c.source_id,c.tier,c.period_start,c.period_end
  ) bucket_id from classified c
 ), inserted_buckets as (
  insert into public.discord_memory_buckets(id,source_id,tier,period_start,period_end,as_of,policy_revision,message_count)
  select c.bucket_id,c.source_id,c.tier,c.period_start,c.period_end,p_as_of,policy.revision,count(*)
  from assigned c group by c.bucket_id,c.source_id,c.tier,c.period_start,c.period_end
  returning id
 ), inserted_members as (
  insert into public.discord_memory_members(message_id,source_id,bucket_id)
  select c.message_id,c.source_id,c.bucket_id from assigned c
  -- A scalar dependency publishes parents first without joining every original
  -- against the complete bucket list. It executes once for the whole statement.
  where c.guild_id=p_guild_id and (select count(*) from inserted_buckets)>0
  returning message_id
 ) select (select count(*) from inserted_buckets),(select count(*) from inserted_members) into buckets,members;
 return jsonb_build_object('buckets',buckets,'messages',members,'as_of',p_as_of,'policy_revision',policy.revision);
end $$;
-- CREATE OR REPLACE preserves existing ACLs, stated again for audit clarity.
revoke all on function public.discord_rebuild_memory(text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.discord_rebuild_memory(text,bigint,timestamptz) to service_role;
notify pgrst,'reload schema';
