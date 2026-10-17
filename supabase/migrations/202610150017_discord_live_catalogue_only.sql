-- M29: explicitly retire every stored Discord summary, job, vector and receipt.
-- Keep only the metadata catalogue and view policy; live originals stay in Discord.
-- The operator must stop the legacy summary service before applying this file.
begin;
lock table public.discord_view_policies,public.discord_channels,
 public.discord_channel_metadata,public.discord_discovery_state,
 public.discord_summary_jobs,public.discord_summary_results,
 public.discord_summary_certificates,public.discord_summary_requests,
 public.discord_summary_operations,public.discord_summary_operation_jobs,
 public.discord_compaction_ledger,public.discord_live_summary_state,
 public.discord_live_summary_jobs,public.discord_live_summary_results,
 public.discord_live_summary_runs,public.discord_live_summary_requests,
 public.discord_summary_vectors in access exclusive mode;
lock table public.knowledge_sources in share row exclusive mode;

alter table public.discord_view_policies
 add column channels jsonb not null default '[]'::jsonb check(jsonb_typeof(channels)='array'),
 add column discovery_state jsonb check(discovery_state is null or jsonb_typeof(discovery_state)='object'),
 add column last_discovery_at timestamptz;

-- Older explicitly configured channels may predate guild policy registration.
-- Preserve those identities with a paused policy rather than granting new reads.
insert into public.discord_view_policies(guild_id)
 select distinct guild_id from public.discord_channels on conflict do nothing;

-- Preserve every ancestry node, including excluded categories and disabled
-- channels, and merge registered identities without regenerating any source UUID.
with nodes as (
 select coalesce(m.guild_id,c.guild_id) guild_id,coalesce(m.channel_id,c.channel_id) channel_id,
  coalesce(to_jsonb(m),'{}'::jsonb)||coalesce(to_jsonb(c),'{}'::jsonb)||jsonb_build_object(
   'guild_id',coalesce(m.guild_id,c.guild_id),'channel_id',coalesce(m.channel_id,c.channel_id),
   'parent_id',m.parent_id,'channel_type',m.channel_type,
   'access_status',coalesce(m.access_status,'unknown_ancestry'),'eligible',coalesce(m.eligible,false),
   'generation',m.generation,'source_id',coalesce(c.source_id,s.id),
   'title',coalesce(c.title,s.title,(select v->>'name' from public.discord_discovery_state d
     cross join lateral jsonb_array_elements(coalesce(d.state->'parents','[]'::jsonb)) v
     where d.guild_id=coalesce(m.guild_id,c.guild_id) and v->>'id'=coalesce(m.channel_id,c.channel_id) limit 1),
     'Discord '||coalesce(m.channel_id,c.channel_id)),
   'enabled',coalesce(c.enabled,false),'source_status',coalesce(s.status,'disabled'),
   'backfill_from',coalesce(c.backfill_from,p.backfill_from),
   'policy_revision',coalesce(c.policy_revision,p.revision)) body
 from public.discord_channel_metadata m full join public.discord_channels c
  on c.guild_id=m.guild_id and c.channel_id=m.channel_id
 join public.discord_view_policies p on p.guild_id=coalesce(m.guild_id,c.guild_id)
 left join public.knowledge_sources s on s.kind='discord' and
  (s.id=c.source_id or c.source_id is null and s.external_id=coalesce(m.channel_id,c.channel_id))
), grouped as (
 select guild_id,jsonb_agg(body order by channel_id) channels from nodes group by guild_id
)
update public.discord_view_policies p set channels=g.channels from grouped g where g.guild_id=p.guild_id;
update public.discord_view_policies p set discovery_state=to_jsonb(d),
 last_discovery_at=case when d.state->>'phase'='complete' and d.policy_revision=p.revision then d.updated_at end
 from public.discord_discovery_state d where d.guild_id=p.guild_id;

do $$begin
 if exists(select n->>'channel_id' from public.discord_view_policies p
  cross join lateral jsonb_array_elements(p.channels) n group by n->>'channel_id' having count(*)>1) then
  raise check_violation using message='Duplicate Discord channel identity in catalogue';
 end if;
 if exists(select 1 from public.knowledge_sources s where s.kind='discord' and not exists(
  select 1 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) n
  where n->>'source_id'=s.id::text and n->>'channel_id'=s.external_id)) then
  raise check_violation using message='Discord source identity missing from consolidated catalogue';
 end if;
end $$;

-- Old composite return types disappear with the channel table. JSON arrays have
-- the same PostgREST response shape and retain deployed RPC names/arguments.
drop function public.discord_list_channels(text);
drop function public.discord_sync_channels();

create or replace function public.discord_get_policy(p_guild_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('guild_id',guild_id,'revision',revision,'paused',paused,
  'discovery_enabled',discovery_enabled,'excluded_category_ids',excluded_category_ids,
  'excluded_channel_ids',excluded_channel_ids,'backfill_from',backfill_from,'updated_at',updated_at)
 from public.discord_view_policies where guild_id=p_guild_id;
$$;
create or replace function public.discord_get_discovery_state(p_guild_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select discovery_state->'state' from public.discord_view_policies
 where guild_id=p_guild_id and (discovery_state->>'policy_revision')::bigint=revision;
$$;

create or replace function public.discord_channel_allowed(p_guild_id text,p_channel_id text,p_allow_paused boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare policy public.discord_view_policies;node jsonb;current_id text:=p_channel_id;
 visited text[]:='{}';child_type integer;active_generation text;
begin
 select * into policy from public.discord_view_policies where guild_id=p_guild_id;
 if policy.guild_id is null or not policy.discovery_enabled or policy.paused and not p_allow_paused then return false;end if;
 if not p_allow_paused and ((policy.discovery_state->>'policy_revision')::bigint is distinct from policy.revision
  or policy.discovery_state->'state'->>'phase' is distinct from 'complete') then return false;end if;
 loop
  if current_id is null or current_id=any(visited) or cardinality(visited)>8
   or current_id=any(policy.excluded_category_ids) or current_id=any(policy.excluded_channel_ids) then return false;end if;
  visited:=array_append(visited,current_id);
  select n into node from jsonb_array_elements(policy.channels) n where n->>'channel_id'=current_id;
  if cardinality(visited)=1 then active_generation:=node->>'generation';end if;
  if node is null or node->>'channel_type' is null or active_generation is null or node->>'generation' is distinct from active_generation
   or node->>'access_status' in ('excluded','unknown_ancestry','permission_denied','not_found') then return false;end if;
  if not p_allow_paused and active_generation is distinct from policy.discovery_state->>'generation' then return false;end if;
  if cardinality(visited)>1 and ((child_type in (10,11,12) and (node->>'channel_type')::integer not in (0,5,15,16))
   or (child_type not in (10,11,12) and (node->>'channel_type')::integer<>4)) then return false;end if;
  if cardinality(visited)=1 and (not coalesce((node->>'eligible')::boolean,false) or node->>'access_status' is distinct from 'ready') then return false;end if;
  if (node->>'channel_type')::integer=4 and node->>'parent_id' is not null then return false;end if;
  if (node->>'channel_type')::integer in (10,11,12) and node->>'parent_id' is null then return false;end if;
  if node->>'parent_id' is null then return (node->>'channel_type')::integer in (0,2,4,5,13,15,16);end if;
  child_type:=(node->>'channel_type')::integer;current_id:=node->>'parent_id';
 end loop;
end $$;

create function public.discord_list_channels(p_member_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(n order by n->>'title',n->>'channel_id'),'[]'::jsonb)
 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) n
 where n->>'source_id' is not null;
$$;
create function public.discord_sync_channels()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(n order by n->>'channel_id'),'[]'::jsonb)
 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) n
 where n->>'source_id' is not null and coalesce((n->>'enabled')::boolean,false)
 and n->>'source_status'='active' and (n->>'policy_revision')::bigint=p.revision
 and public.discord_channel_allowed(p.guild_id,n->>'channel_id');
$$;

create or replace function public.discord_configure_channel(p_member_id text,p_channel jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;old jsonb;result jsonb;sid uuid;gid text:=p_channel->>'guild_id';cid text:=p_channel->>'channel_id';
begin
 if jsonb_typeof(p_channel) is distinct from 'object' or gid is null or gid !~ '^[0-9]{1,20}$'
  or cid is null or cid !~ '^[0-9]{1,20}$' or length(trim(coalesce(p_channel->>'title',''))) not between 1 and 300
  or jsonb_typeof(p_channel->'enabled') is distinct from 'boolean'
  or (p_channel->>'backfill_from')::timestamptz>now() then raise check_violation using message='Invalid channel';end if;
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 insert into public.discord_view_policies(guild_id) values(gid) on conflict do nothing;
 select * into policy from public.discord_view_policies where guild_id=gid for update;
 if exists(select 1 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) n
  where p.guild_id<>gid and n->>'channel_id'=cid) then raise check_violation using message='Channel identity cannot change';end if;
 select n into old from jsonb_array_elements(policy.channels) n where n->>'channel_id'=cid;
 sid:=coalesce((p_channel->>'source_id')::uuid,(old->>'source_id')::uuid,gen_random_uuid());
 if old->>'source_id' is not null and sid::text is distinct from old->>'source_id' then
  raise check_violation using message='Channel identity cannot change';end if;
 if exists(select 1 from public.knowledge_sources where id=sid) or exists(
  select 1 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) n
  where n->>'source_id'=sid::text and (p.guild_id<>gid or n->>'channel_id'<>cid)) then
  raise check_violation using message='Source identity mismatch';end if;
 result:=coalesce(old,jsonb_build_object('parent_id',null,'channel_type',null,'access_status','unknown_ancestry','eligible',false,'generation',null))
  ||jsonb_build_object('source_id',sid,'channel_id',cid,'guild_id',gid,'title',p_channel->>'title',
   'enabled',(p_channel->>'enabled')::boolean,'backfill_from',coalesce((p_channel->>'backfill_from')::timestamptz,policy.backfill_from),
   'policy_revision',policy.revision+1,'updated_at',now(),'source_status','disabled');
 -- Any operator channel change invalidates in-flight live reads and discovery.
 -- The next complete generation republishes eligible sources under this revision.
 update public.discord_view_policies set revision=policy.revision+1,channels=(select coalesce(jsonb_agg(
  n||jsonb_build_object('policy_revision',policy.revision+1,'source_status','disabled') order by n->>'channel_id'),'[]'::jsonb)
  from (select n from jsonb_array_elements(policy.channels) n where n->>'channel_id'<>cid union all select result) entries),updated_at=now() where guild_id=gid;
 return result;
end $$;

create or replace function public.discord_configure_policy(p_member_id text,p_guild_id text,p_policy jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.discord_view_policies;categories text[];blocked_channels text[];
begin
 if p_guild_id is null or p_guild_id !~ '^[0-9]{1,20}$' or jsonb_typeof(p_policy) is distinct from 'object'
  or jsonb_typeof(p_policy->'paused') is distinct from 'boolean' or jsonb_typeof(p_policy->'discovery_enabled') is distinct from 'boolean'
  or jsonb_typeof(p_policy->'excluded_category_ids') is distinct from 'array' or jsonb_typeof(p_policy->'excluded_channel_ids') is distinct from 'array'
  or jsonb_array_length(p_policy->'excluded_category_ids')>500 or jsonb_array_length(p_policy->'excluded_channel_ids')>500
  or exists(select 1 from jsonb_array_elements(p_policy->'excluded_category_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
  or exists(select 1 from jsonb_array_elements(p_policy->'excluded_channel_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
  or coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z')>now() then raise check_violation using message='Invalid policy';end if;
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into old from public.discord_view_policies where guild_id=p_guild_id for update;
 if old.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy';end if;
 select coalesce(array_agg(distinct v),'{}') into categories from jsonb_array_elements_text(p_policy->'excluded_category_ids') v;
 select coalesce(array_agg(distinct v),'{}') into blocked_channels from jsonb_array_elements_text(p_policy->'excluded_channel_ids') v;
 insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,backfill_from)
 values(p_guild_id,coalesce(old.revision,0)+1,(p_policy->>'paused')::boolean,(p_policy->>'discovery_enabled')::boolean,categories,blocked_channels,
  coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z'))
 on conflict(guild_id) do update set revision=excluded.revision,paused=excluded.paused,discovery_enabled=excluded.discovery_enabled,
  excluded_category_ids=excluded.excluded_category_ids,excluded_channel_ids=excluded.excluded_channel_ids,backfill_from=excluded.backfill_from,updated_at=now();
 update public.discord_view_policies p set channels=(select coalesce(jsonb_agg(n||jsonb_build_object(
  'policy_revision',p.revision,'source_status','disabled') order by n->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(p.channels) n)
 where guild_id=p_guild_id;
 return public.discord_get_policy(p_guild_id);
end $$;

create or replace function public.discord_persist_discovery(p_guild_id text,p_expected_policy_revision bigint,p_expected_generation uuid,p_expected_state jsonb,p_channels jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;n jsonb;old jsonb;node jsonb;catalogue jsonb;generation uuid;
begin
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into policy from public.discord_view_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.discovery_enabled or policy.revision is distinct from p_expected_policy_revision then return false;end if;
 if jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>100
  or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'generation' is null
  or (p_state->>'policyRevision')::bigint is distinct from policy.revision or octet_length(p_state::text)>3000000 then raise check_violation using message='Invalid discovery';end if;
 generation:=(p_state->>'generation')::uuid;
 if (case when (policy.discovery_state->>'policy_revision')::bigint=policy.revision then (policy.discovery_state->>'generation')::uuid end) is distinct from p_expected_generation
  or (case when (policy.discovery_state->>'policy_revision')::bigint=policy.revision then policy.discovery_state->'state' end) is distinct from p_expected_state then return false;end if;
 if (select count(distinct v->>'channelId') from jsonb_array_elements(p_channels) v)<>jsonb_array_length(p_channels) then raise check_violation using message='Duplicate discovery channel';end if;
 catalogue:=(select coalesce(jsonb_agg(v||jsonb_build_object('source_status','disabled') order by v->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(policy.channels) v);
 for n in select jsonb_array_elements(p_channels) loop
  if n->>'channelId' is null or n->>'channelId' !~ '^[0-9]{1,20}$' or n->>'guildId' is distinct from p_guild_id
   or coalesce(n->>'parentId','0') !~ '^[0-9]{1,20}$' or (n->>'type')::integer not in (0,2,4,5,10,11,12,13,15,16)
   or n->>'type' is null or n->>'accessStatus' is null or n->>'accessStatus' not in ('metadata','ready','excluded','unknown_ancestry','permission_denied','not_found')
   or jsonb_typeof(n->'eligible') is distinct from 'boolean' or length(trim(coalesce(n->>'title',''))) not between 1 and 300 then raise check_violation using message='Invalid discovery channel';end if;
  if exists(select 1 from public.discord_view_policies p cross join lateral jsonb_array_elements(p.channels) v
   where p.guild_id<>p_guild_id and v->>'channel_id'=n->>'channelId') then raise check_violation using message='Channel guild mismatch';end if;
  select v into old from jsonb_array_elements(catalogue) v where v->>'channel_id'=n->>'channelId';
  node:=coalesce(old,'{}'::jsonb)||jsonb_build_object('channel_id',n->>'channelId','guild_id',p_guild_id,
   'parent_id',n->>'parentId','channel_type',(n->>'type')::integer,'access_status',n->>'accessStatus','eligible',(n->>'eligible')::boolean,
   'generation',generation,'title',n->>'title','enabled',false,'source_status','disabled',
   'source_id',old->>'source_id','backfill_from',coalesce((old->>'backfill_from')::timestamptz,policy.backfill_from),
   'policy_revision',policy.revision,'updated_at',now());
  catalogue:=(select coalesce(jsonb_agg(v order by v->>'channel_id'),'[]'::jsonb) from
   (select v from jsonb_array_elements(catalogue) v where v->>'channel_id'<>n->>'channelId' union all select node) entries);
 end loop;
 update public.discord_view_policies set channels=catalogue where guild_id=p_guild_id;
 -- Allocate a stable UUID only after the full batch ancestry is visible. Partial
 -- generations remain disabled; only completeDiscovery publishes active sources.
 for n in select jsonb_array_elements(p_channels) loop
  if (n->>'eligible')::boolean and public.discord_channel_allowed(p_guild_id,n->>'channelId',true) then
   catalogue:=(select coalesce(jsonb_agg(case when v->>'channel_id'=n->>'channelId' then
    v||jsonb_build_object('source_id',coalesce(v->>'source_id',gen_random_uuid()::text)) else v end order by v->>'channel_id'),'[]'::jsonb)
    from jsonb_array_elements(catalogue) v);
  end if;
 end loop;
 update public.discord_view_policies set channels=catalogue,discovery_state=jsonb_build_object(
  'guild_id',p_guild_id,'policy_revision',policy.revision,'generation',generation,'state',p_state,'updated_at',now()),updated_at=now()
 where guild_id=p_guild_id;
 return true;
end $$;

create or replace function public.discord_complete_discovery(p_guild_id text,p_generation uuid,p_expected_policy_revision bigint,p_expected_state jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;catalogue jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into policy from public.discord_view_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or policy.revision is distinct from p_expected_policy_revision
  or (policy.discovery_state->>'policy_revision')::bigint is distinct from policy.revision
  or (policy.discovery_state->>'generation')::uuid is distinct from p_generation
  or policy.discovery_state->'state' is distinct from p_expected_state then return false;end if;
 if p_state->>'phase' is distinct from 'complete' or (p_state->>'generation')::uuid is distinct from p_generation
  or (p_state->>'policyRevision')::bigint is distinct from policy.revision then raise check_violation using message='Invalid completion';end if;
 catalogue:=(select coalesce(jsonb_agg(n||jsonb_build_object('enabled',
  n->>'source_id' is not null and n->>'generation'=p_generation::text and public.discord_channel_allowed(p_guild_id,n->>'channel_id',true),
  'source_status',case when not policy.paused and n->>'source_id' is not null and n->>'generation'=p_generation::text
   and public.discord_channel_allowed(p_guild_id,n->>'channel_id',true) then 'active' else 'disabled' end)
  order by n->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(policy.channels) n);
 update public.discord_view_policies set channels=catalogue,discovery_state=jsonb_build_object(
  'guild_id',p_guild_id,'policy_revision',policy.revision,'generation',p_generation,'state',p_state,'updated_at',now()),
  last_discovery_at=now(),updated_at=now() where guild_id=p_guild_id;
 return true;
end $$;

-- Explicitly remove trigger bindings, then caller-before-callee summary RPCs.
-- The summary service is stopped by the operator; locks above prevent late writes.
drop trigger discord_legacy_job_retired on public.discord_summary_jobs;
drop trigger discord_legacy_result_retired on public.discord_summary_results;
drop trigger discord_compaction_disjoint on public.discord_compaction_ledger;
drop function public.discord_live_summary_begin_run(text,numeric,integer);
drop function public.discord_live_summary_claim(text,text,text,text,integer);
drop function public.discord_live_summary_claim_embedding(text);
drop function public.discord_live_summary_commit_usage(uuid,text,jsonb);
drop function public.discord_live_summary_cutover(text,bigint,boolean);
drop function public.discord_live_summary_fail(uuid,uuid);
drop function public.discord_live_summary_finish(uuid,uuid,jsonb,jsonb,jsonb);
drop function public.discord_live_summary_plan(text,timestamp with time zone,text,text,text,text);
drop function public.discord_live_summary_queue_embeddings(text,integer);
drop function public.discord_live_summary_release_embedding(uuid,uuid);
drop function public.discord_live_summary_renew(uuid,uuid);
drop function public.discord_live_summary_reserve(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,numeric);
drop function public.discord_live_summary_retire_archive();
drop function public.discord_live_summary_save_embedding(uuid,uuid,text,extensions.vector);
drop function public.discord_live_summary_search(text,uuid[],text,text[],timestamp with time zone,timestamp with time zone,integer,extensions.vector);
drop function public.discord_live_summary_status(text);
drop function public.discord_summary_ledger_guard();
drop function public.discord_summary_list_results(text,uuid[],text,uuid,integer);
drop function public.discord_live_summary_enabled(text,bigint);
drop function public.discord_live_summary_envelope(text,uuid);
drop function public.discord_live_summary_lock(uuid,uuid);
drop function public.discord_summary_citation_ids(jsonb);
drop function public.discord_summary_period_key(text,timestamp with time zone);
drop function public.discord_summary_valid_summary(jsonb,text[]);

-- User-approved destructive retirement: no historical Discord summary or receipt
-- remains. Dependency ordering is explicit and never expands to unrelated data.
drop table public.discord_live_summary_requests;
drop table public.discord_summary_vectors;
drop table public.discord_live_summary_results;
drop table public.discord_live_summary_jobs;
drop table public.discord_live_summary_runs;
drop table public.discord_live_summary_state;
drop table public.discord_summary_requests;
drop table public.discord_summary_operation_jobs;
drop table public.discord_summary_results;
drop table public.discord_compaction_ledger;
drop table public.discord_summary_certificates;
drop table public.discord_summary_jobs;
drop table public.discord_summary_operations;
drop table public.discord_discovery_state;
drop table public.discord_channel_metadata;
drop table public.discord_channels;

-- Identities were verified inside the JSON catalogue before this exact deletion.
-- Miro and every non-Discord source remain byte-for-byte unchanged.
delete from public.knowledge_sources where kind='discord';

alter table public.discord_view_policies enable row level security;
alter table public.discord_view_policies force row level security;
revoke all on table public.discord_view_policies from public,anon,authenticated;
grant select,insert,update,delete on table public.discord_view_policies to service_role;
revoke all on function public.discord_get_policy(text),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_list_channels(text),
 public.discord_configure_channel(text,jsonb),
 public.discord_sync_channels(),
 public.discord_get_discovery_state(text),
 public.discord_persist_discovery(text,bigint,uuid,jsonb,jsonb,jsonb),
 public.discord_complete_discovery(text,uuid,bigint,jsonb,jsonb),
 public.discord_channel_allowed(text,text,boolean) from public,anon,authenticated;
grant execute on function public.discord_get_policy(text),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_list_channels(text),
 public.discord_configure_channel(text,jsonb),
 public.discord_sync_channels(),
 public.discord_get_discovery_state(text),
 public.discord_persist_discovery(text,bigint,uuid,jsonb,jsonb,jsonb),
 public.discord_complete_discovery(text,uuid,bigint,jsonb,jsonb),
 public.discord_channel_allowed(text,text,boolean) to service_role;

notify pgrst,'reload schema';
commit;
