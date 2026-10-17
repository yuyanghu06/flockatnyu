-- Shared club tool: authorization belongs to trusted backend source scope and
-- backend admin checks. The service-only SQL surface remains inaccessible to
-- browser roles. Retain p_member_id arguments solely for deployed RPC clients.
-- The user explicitly approved removal of the two populated membership tables.
begin;

CREATE OR REPLACE FUNCTION public.discord_configure_channel(p_member_id text, p_channel jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare sid uuid; existing public.discord_channels; result public.discord_channels; begin
 if p_channel->>'channel_id' !~ '^[0-9]{1,20}$' or p_channel->>'guild_id' !~ '^[0-9]{1,20}$'
 or length(trim(p_channel->>'title')) not between 1 and 300 or jsonb_typeof(p_channel->'enabled') is distinct from 'boolean'
 or (p_channel->>'backfill_from')::timestamptz > now()
 then raise check_violation using message='Invalid channel'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_channel->>'channel_id'));
 select * into existing from public.discord_channels where channel_id=p_channel->>'channel_id';
 sid:=coalesce((p_channel->>'source_id')::uuid,existing.source_id);
 if existing.source_id is not null and ((sid is distinct from existing.source_id) or existing.guild_id is distinct from p_channel->>'guild_id')
 then raise check_violation using message='Channel identity cannot change'; end if;
 if sid is null then
   insert into public.knowledge_sources(kind,external_id,title,original_url,status)
   values('discord',p_channel->>'channel_id',p_channel->>'title','https://discord.com/channels/'||(p_channel->>'guild_id')||'/'||(p_channel->>'channel_id'),case when (p_channel->>'enabled')::boolean then 'active' else 'disabled' end)
   on conflict(kind,external_id) do update set title=excluded.title returning id into sid;
 end if;
 if not exists(select 1 from public.knowledge_sources where id=sid and kind='discord' and external_id=p_channel->>'channel_id')
 then raise check_violation using message='Source identity mismatch'; end if;
 insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,backfill_from)
 values(sid,p_channel->>'channel_id',p_channel->>'guild_id',p_channel->>'title',(p_channel->>'enabled')::boolean,(p_channel->>'backfill_from')::timestamptz)
 on conflict(source_id) do update set title=excluded.title,enabled=excluded.enabled,backfill_from=excluded.backfill_from,updated_at=now()
 returning * into result;
 update public.knowledge_sources set title=result.title,status=case when result.enabled then 'active' else 'disabled' end,updated_at=now() where id=sid;
 -- Shared reads still require a trusted backend source allowlist.
 return to_jsonb(result);
end $function$;

CREATE OR REPLACE FUNCTION public.discord_configure_policy(p_member_id text, p_guild_id text, p_policy jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare old public.discord_view_policies; result public.discord_view_policies; categories text[]; channels text[]; begin
 if p_guild_id !~ '^[0-9]{1,20}$' or jsonb_typeof(p_policy) is distinct from 'object'
 or jsonb_typeof(p_policy->'paused') is distinct from 'boolean' or jsonb_typeof(p_policy->'discovery_enabled') is distinct from 'boolean'
 or jsonb_typeof(p_policy->'excluded_category_ids') is distinct from 'array' or jsonb_typeof(p_policy->'excluded_channel_ids') is distinct from 'array'
 or jsonb_array_length(p_policy->'excluded_category_ids')>500 or jsonb_array_length(p_policy->'excluded_channel_ids')>500
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_category_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_channel_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z')>now()
 then raise check_violation using message='Invalid policy'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-policy:'||p_guild_id));
 select * into old from public.discord_view_policies where guild_id=p_guild_id for update;
 if old.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy'; end if;
 select coalesce(array_agg(distinct v),'{}') into categories from jsonb_array_elements_text(p_policy->'excluded_category_ids') v;
 select coalesce(array_agg(distinct v),'{}') into channels from jsonb_array_elements_text(p_policy->'excluded_channel_ids') v;
 insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,backfill_from)
 values(p_guild_id,coalesce(old.revision,0)+1,(p_policy->>'paused')::boolean,(p_policy->>'discovery_enabled')::boolean,categories,channels,coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z'))
 on conflict(guild_id) do update set revision=excluded.revision,paused=excluded.paused,discovery_enabled=excluded.discovery_enabled,excluded_category_ids=excluded.excluded_category_ids,excluded_channel_ids=excluded.excluded_channel_ids,backfill_from=excluded.backfill_from,updated_at=now() returning * into result;
 update public.discord_channels set policy_revision=result.revision where guild_id=p_guild_id;
 update public.knowledge_sources s set status='disabled',updated_at=now() from public.discord_channels c where c.source_id=s.id and c.guild_id=p_guild_id;
 -- Revision/source invalidation requires fresh discovery before retrieval.
 return to_jsonb(result);
end $function$;

CREATE OR REPLACE FUNCTION public.discord_list_channels(p_member_id text)
 RETURNS SETOF public.discord_channels
 LANGUAGE plpgsql
 SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
begin
 return query select * from public.discord_channels order by title,channel_id;
end $function$;

CREATE OR REPLACE FUNCTION public.discord_live_summary_search(p_member_id text, p_allowed_source_ids uuid[], p_query text DEFAULT ''::text, p_channel_ids text[] DEFAULT '{}'::text[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 5, p_vector extensions.vector DEFAULT NULL::extensions.vector)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$declare result jsonb;begin
 if coalesce(cardinality(p_allowed_source_ids),0) not between 1 and 500 or p_limit not between 1 and 8 or length(p_query)>500 or cardinality(p_channel_ids)>100 or p_from is not null and p_to is not null and p_from>=p_to then return '[]';end if;
 select coalesce(jsonb_agg(row.body order by row.score desc,row.period_end desc),'[]') into result from (
 select body,coalesce(case when p_vector is not null and v.status='ready' and v.content_hash=encode(sha256(convert_to(body::text,'UTF8')),'hex') then 1-(v.embedding operator(extensions.<=>) p_vector) end,ts_rank_cd(to_tsvector('english',(body->'summary')::text),plainto_tsquery('english',p_query))) score,j.period_end
 from (
 select 'live' kind,r.id,r.source_id,j.guild_id,j.channel_id,j.period_start,j.period_end from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id where j.status='succeeded'
 union all select 'legacy',r.id,r.source_id,j.guild_id,j.channel_id,j.period_start,j.period_end from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id
 ) j join public.discord_channels c on c.source_id=j.source_id and c.enabled join public.knowledge_sources s on s.id=j.source_id and s.status='active'
 cross join lateral (select public.discord_live_summary_envelope(j.kind,j.id) body) env
 left join public.discord_summary_vectors v on v.summary_kind=j.kind and v.summary_id=j.id
 where j.source_id=any(p_allowed_source_ids) and public.discord_channel_allowed(j.guild_id,j.channel_id) and body is not null
 and (cardinality(p_channel_ids)=0 or j.channel_id=any(p_channel_ids)) and (p_from is null or j.period_end>p_from) and (p_to is null or j.period_start<p_to)
 and (p_query='' or p_vector is not null or to_tsvector('english',(body->'summary')::text)@@plainto_tsquery('english',p_query))
 order by score desc,j.period_end desc limit p_limit
 ) row;return result;
end $function$;

CREATE OR REPLACE FUNCTION public.discord_summary_list_results(p_member_id text, p_allowed_source_ids uuid[], p_tier text DEFAULT NULL::text, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare row record;result jsonb:='[]';begin
 if coalesce(cardinality(p_allowed_source_ids),0) not between 1 and 100 or p_limit not between 1 and 20 or p_tier is not null and p_tier not in ('weekly','monthly') then return result;end if;
 perform 1 from public.discord_view_policies p where p.guild_id in(select c.guild_id from public.discord_channels c where c.source_id=any(p_allowed_source_ids)) order by p.guild_id for share;
 for row in select r.id result_id,r.summary,r.citations,r.created_at result_created,cert.id certificate_id,cert.coverage_digest,cert.dependencies,j.* from public.discord_summary_results r
 join public.discord_summary_certificates cert on cert.id=r.certificate_id and cert.source_id=r.source_id join public.discord_compaction_ledger l on l.certificate_id=cert.id and l.active
 join public.discord_summary_jobs j on j.id=cert.job_id join public.discord_channels c on c.source_id=j.source_id and c.enabled join public.knowledge_sources s on s.id=j.source_id and s.status='active'
 where j.source_id=any(p_allowed_source_ids) and public.discord_channel_allowed(j.guild_id,j.channel_id) and (p_tier is null or j.tier=p_tier) and (p_after is null or r.id>p_after)
 and cert.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex') order by r.id limit p_limit loop
  result:=result||jsonb_build_array(jsonb_build_object('summaryId',row.result_id,'jobId',row.id,'certificateId',row.certificate_id,'sourceId',row.source_id,'guildId',row.guild_id,'channelId',row.channel_id,'channelName',row.channel_name,'tier',row.tier,'periodKey',row.period_key,'periodStart',row.period_start,'periodEnd',row.period_end,'inputFingerprint',row.input_fingerprint,'inputRecordCount',row.input_record_count,'representedMessageCount',row.represented_message_count,'rawMessageCount',row.raw_message_count,'summaryInputCount',row.summary_input_count,'coverageDigest',row.coverage_digest,'dependencies',row.dependencies,'provider',row.provider,'model',row.model,'promptVersion',row.prompt_version,'summary',row.summary,'citations',row.citations,'createdAt',row.result_created));
 end loop;return result;
end $function$;

CREATE OR REPLACE FUNCTION public.miro_authorized_board(p_member_id text, p_allowed_source_ids uuid[], p_board_id text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('board_id',b.board_id,'source_id',b.source_id,'team_id',b.team_id,
    'title',coalesce(nullif(left(b.data->'board'->>'name',300),''),s.title,b.board_id),
    'url','https://miro.com/app/board/'||b.board_id||'/',
    'last_success_at',b.last_success_at,'status',b.status)
  from public.miro_boards b
  join public.knowledge_sources s on s.id=b.source_id
  where b.board_id=p_board_id and b.enabled and s.kind='miro' and s.external_id=b.board_id and s.status='active'
    and s.id=any(p_allowed_source_ids) and cardinality(p_allowed_source_ids) between 1 and 1000;
$function$;

CREATE OR REPLACE FUNCTION public.miro_sync_register(p_board_id text, p_team_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare b public.miro_boards; sid uuid;
begin
  if p_board_id is null or p_board_id !~ '^[A-Za-z0-9_=-]{1,200}$'
    or (p_team_id is not null and p_team_id !~ '^[A-Za-z0-9_=-]{1,200}$') then
    raise invalid_parameter_value using message='Invalid Miro scope';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('miro:'||p_board_id));
  select * into b from public.miro_boards where board_id=p_board_id;
  if found then
    if b.team_id is distinct from p_team_id then
      raise check_violation using message='Miro team configuration requires explicit operator change';
    end if;
    return to_jsonb(b);
  end if;
  insert into public.knowledge_sources(kind,external_id,title,original_url,status)
    values('miro',p_board_id,p_board_id,'https://miro.com/app/board/'||p_board_id||'/','active')
    on conflict(kind,external_id) do nothing;
  select id into sid from public.knowledge_sources where kind='miro' and external_id=p_board_id for update;
  insert into public.miro_boards(board_id,source_id,team_id)
    values(p_board_id,sid,p_team_id)
    returning * into b;
  -- Preserve source state; registration never reactivates a disabled source.
  return to_jsonb(b);
end $function$;

-- Exact approved retirement only. DROP without dependency expansion fails
-- safely if an unexpected foreign key, view or typed routine still depends on
-- these relations. Shared source identity and every other stored row remain.
drop table public.knowledge_source_members;
drop table public.discord_admin_members;

-- CREATE OR REPLACE preserves ownership and grants; restate service-only
-- execution explicitly for every rewritten read/admin RPC.
revoke all on function public.discord_configure_channel(text,jsonb),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_list_channels(text),
 public.discord_live_summary_search(text,uuid[],text,text[],timestamptz,timestamptz,integer,extensions.vector),
 public.discord_summary_list_results(text,uuid[],text,uuid,integer),
 public.miro_authorized_board(text,uuid[],text),
 public.miro_sync_register(text,text) from public,anon,authenticated;
grant execute on function public.discord_configure_channel(text,jsonb),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_list_channels(text),
 public.discord_live_summary_search(text,uuid[],text,text[],timestamptz,timestamptz,integer,extensions.vector),
 public.discord_summary_list_results(text,uuid[],text,uuid,integer),
 public.miro_authorized_board(text,uuid[],text),
 public.miro_sync_register(text,text) to service_role;

notify pgrst,'reload schema';
commit;
