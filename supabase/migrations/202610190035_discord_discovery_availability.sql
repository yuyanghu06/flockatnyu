-- Keep the last completed Discord metadata catalogue available while its next
-- same-policy generation is staged. Observed revocations still withdraw access
-- immediately. This stores metadata only, in the existing policy JSONB columns.
begin;
select pg_advisory_xact_lock(hashtext('discord-catalogue'));
lock table public.discord_view_policies in share row exclusive mode;

-- Only a complete, current-policy legacy generation proves publication. An
-- in-flight legacy catalogue has already mixed generations and cannot be used
-- as a fallback. Preserve that work for completion, but do not restore access.
update public.discord_view_policies p set discovery_state=
 coalesce(p.discovery_state,'{}'::jsonb)||jsonb_build_object(
  'published',case when p.discovery_state->'state'->>'phase'='complete'
   and p.discovery_state->>'policy_revision'=p.revision::text
   and p.discovery_state->>'generation' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then jsonb_build_object('generation',p.discovery_state->>'generation','policy_revision',p.revision)
   else null end,
  'staging_channels',case when p.discovery_state->>'policy_revision'=p.revision::text
   and p.discovery_state->'state'->>'phase' in ('channels','active','archives')
   then p.channels else '[]'::jsonb end);

-- Private metadata validator: it does not grant live access or inspect a caller
-- supplied paused override. The public access RPC below always uses publication
-- proof; discovery uses this helper only to validate an atomic promotion.
create function public.discord_catalogue_metadata_allowed(
 p_channels jsonb,p_channel_id text,p_generation text,p_excluded_category_ids text[],p_excluded_channel_ids text[])
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare node jsonb;current_id text:=p_channel_id;visited text[]:='{}';child_type integer;node_type integer;
begin
 if jsonb_typeof(p_channels) is distinct from 'array' or p_generation is null
  or p_excluded_category_ids is null or p_excluded_channel_ids is null then return false;end if;
 loop
  if current_id is null or current_id=any(visited) or cardinality(visited)>8
   or current_id=any(p_excluded_category_ids) or current_id=any(p_excluded_channel_ids) then return false;end if;
  visited:=array_append(visited,current_id);
  select n into node from jsonb_array_elements(p_channels) n where n->>'channel_id'=current_id;
  if node is null or node->>'generation' is distinct from p_generation
   or coalesce((node->>'manual_disabled')::boolean,false)
   or coalesce((node->>'discovery_withdrawn')::boolean,false)
   or coalesce(node->>'channel_type','') not in ('0','2','4','5','10','11','12','13','15','16') then return false;end if;
  node_type:=(node->>'channel_type')::integer;
  if node->>'access_status' is distinct from (case when node_type=4 then 'metadata' else 'ready' end) then return false;end if;
  if cardinality(visited)=1 and not coalesce((node->>'eligible')::boolean,false) then return false;end if;
  if cardinality(visited)>1 and ((child_type in (10,11,12) and node_type not in (0,5,15,16))
   or (child_type not in (10,11,12) and node_type<>4)) then return false;end if;
  if node_type=4 and node->>'parent_id' is not null then return false;end if;
  if node_type in (10,11,12) and node->>'parent_id' is null then return false;end if;
  if node->>'parent_id' is null then return node_type in (0,2,4,5,13,15,16);end if;
  child_type:=node_type;current_id:=node->>'parent_id';
 end loop;
end $$;
revoke all on function public.discord_catalogue_metadata_allowed(jsonb,text,text,text[],text[]) from public,anon,authenticated;
grant execute on function public.discord_catalogue_metadata_allowed(jsonb,text,text,text[],text[]) to service_role;

create or replace function public.discord_channel_allowed(p_guild_id text,p_channel_id text,p_allow_paused boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare policy public.discord_view_policies;node jsonb;published jsonb;
begin
 select * into policy from public.discord_view_policies where guild_id=p_guild_id;
 -- Retain the wire argument for compatibility, but never let it expose staging,
 -- paused policy, or a catalogue invalidated by an operator policy revision.
 if policy.guild_id is null or not policy.discovery_enabled or policy.paused then return false;end if;
 published:=policy.discovery_state->'published';
 if jsonb_typeof(published) is distinct from 'object'
  or published->>'policy_revision' is distinct from policy.revision::text
  or coalesce(published->>'generation','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false;end if;
 select n into node from jsonb_array_elements(policy.channels) n where n->>'channel_id'=p_channel_id;
 if node is null or node->>'source_id' is null or not coalesce((node->>'enabled')::boolean,false)
  or node->>'source_status' is distinct from 'active'
  or node->>'policy_revision' is distinct from policy.revision::text then return false;end if;
 return public.discord_catalogue_metadata_allowed(policy.channels,p_channel_id,published->>'generation',
  policy.excluded_category_ids,policy.excluded_channel_ids);
end $$;

create or replace function public.discord_persist_discovery(p_guild_id text,p_expected_policy_revision bigint,p_expected_generation uuid,p_expected_state jsonb,p_channels jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;n jsonb;old jsonb;node jsonb;catalogue jsonb;staging jsonb;
 generation uuid;prior_generation uuid;prior_state jsonb;observations jsonb:='[]';snapshot jsonb;
 withdrawn text[];invalid_staging text[];parents_loaded boolean;
begin
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into policy from public.discord_view_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.discovery_enabled or policy.revision is distinct from p_expected_policy_revision then return false;end if;
 if jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>100
  or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'generation' is null
  or p_state->>'phase' is null or p_state->>'phase' not in ('channels','active','archives')
  or (p_state->>'policyRevision')::bigint is distinct from policy.revision or octet_length(p_state::text)>3000000 then raise check_violation using message='Invalid discovery';end if;
 generation:=(p_state->>'generation')::uuid;
 if policy.discovery_state->>'policy_revision'=policy.revision::text then
  prior_generation:=(policy.discovery_state->>'generation')::uuid;
  prior_state:=policy.discovery_state->'state';
 end if;
 if prior_generation is distinct from p_expected_generation or prior_state is distinct from p_expected_state then return false;end if;
 -- A resumed scan must keep its generation. A new generation is allowed only
 -- after completion (or a revision change which invalidated the old scan).
 if prior_generation is not null and ((generation is distinct from prior_generation and prior_state->>'phase' is distinct from 'complete')
  or (generation=prior_generation and prior_state->>'phase'='complete')) then return false;end if;
 if (select count(distinct v->>'channelId') from jsonb_array_elements(p_channels) v)<>jsonb_array_length(p_channels) then raise check_violation using message='Duplicate discovery channel';end if;
 catalogue:=policy.channels;
 if generation=prior_generation then
  if jsonb_typeof(policy.discovery_state->'staging_channels') is distinct from 'array' then return false;end if;
  staging:=policy.discovery_state->'staging_channels';
 else
  staging:=policy.channels;
 end if;

 for n in select jsonb_array_elements(p_channels) loop
  if n->>'channelId' is null or n->>'channelId' !~ '^[0-9]{1,20}$' or n->>'guildId' is distinct from p_guild_id
   or coalesce(n->>'parentId','0') !~ '^[0-9]{1,20}$' or coalesce(n->>'type','') not in ('0','2','4','5','10','11','12','13','15','16')
   or n->>'accessStatus' is null or n->>'accessStatus' not in ('metadata','ready','excluded','unknown_ancestry','permission_denied','not_found')
   or jsonb_typeof(n->'eligible') is distinct from 'boolean' or length(trim(coalesce(n->>'title',''))) not between 1 and 300 then raise check_violation using message='Invalid discovery channel';end if;
  if exists(select 1 from public.discord_view_policies p
   cross join lateral jsonb_array_elements(p.channels||coalesce(p.discovery_state->'staging_channels','[]'::jsonb)) v
   where p.guild_id<>p_guild_id and v->>'channel_id'=n->>'channelId') then raise check_violation using message='Channel guild mismatch';end if;
  select v into old from jsonb_array_elements(staging) v where v->>'channel_id'=n->>'channelId';
  node:=coalesce(old,'{}'::jsonb)||jsonb_build_object('channel_id',n->>'channelId','guild_id',p_guild_id,
   'parent_id',n->>'parentId','channel_type',(n->>'type')::integer,'access_status',n->>'accessStatus','eligible',(n->>'eligible')::boolean,
   'generation',generation,'title',n->>'title','enabled',false,'source_status','disabled','discovery_withdrawn',false,
   'source_id',old->>'source_id','backfill_from',coalesce((old->>'backfill_from')::timestamptz,policy.backfill_from),
   'policy_revision',policy.revision,'updated_at',now());
  staging:=(select coalesce(jsonb_agg(v order by v->>'channel_id'),'[]'::jsonb) from
   (select v from jsonb_array_elements(staging) v where v->>'channel_id'<>n->>'channelId' union all select node) entries);
  observations:=observations||jsonb_build_array(jsonb_build_object('channel_id',n->>'channelId','parent_id',n->>'parentId',
   'channel_type',(n->>'type')::integer,'title',n->>'title','access_status',n->>'accessStatus','eligible',(n->>'eligible')::boolean));
 end loop;

 -- The first guild-channel response is a complete parent snapshot, even before
 -- its per-channel checks run. Compare positive metadata immediately. Only the
 -- explicit channelsLoaded marker proves absence; [] at scan start does not.
 -- Active threads are a positive snapshot only: an absent thread may be archived.
 parents_loaded:=coalesce(p_state->'channelsLoaded'='true'::jsonb,false);
 if parents_loaded and jsonb_typeof(p_state->'parents') is distinct from 'array' then raise check_violation using message='Invalid discovery parents';end if;
 for snapshot in select value from jsonb_each(p_state) where key in ('parents','activeThreads') and value<>'null'::jsonb loop
  if jsonb_typeof(snapshot) is distinct from 'array' then raise check_violation using message='Invalid discovery metadata';end if;
  for n in select jsonb_array_elements(snapshot) loop
   if n->>'id' is null or n->>'id' !~ '^[0-9]{1,20}$' or n->>'guild_id' is distinct from p_guild_id
    or coalesce(n->>'parent_id','0') !~ '^[0-9]{1,20}$' or coalesce(n->>'type','') not in ('0','2','4','5','10','11','12','13','15','16')
    or n ? 'accessStatus' and coalesce(n->>'accessStatus','') not in ('metadata','ready','excluded','unknown_ancestry','permission_denied','not_found')
    then raise check_violation using message='Invalid discovery metadata';end if;
   observations:=observations||jsonb_build_array(jsonb_build_object('channel_id',n->>'id','parent_id',n->>'parent_id',
    'channel_type',(n->>'type')::integer,'title',coalesce(nullif(n->>'name',''),'Discord '||(n->>'id')))
    ||case when n ? 'accessStatus' then jsonb_build_object('access_status',n->>'accessStatus') else '{}'::jsonb end);
  end loop;
 end loop;

 -- Withdraw previously published nodes on any observed metadata/access change,
 -- and their old descendants. The withdrawal stays sticky in channels until a
 -- complete generation replaces it; subsequent empty checkpoints cannot undo it.
 with recursive changed(id) as (
  select v->>'channel_id' from jsonb_array_elements(catalogue) v where
   exists(select 1 from jsonb_array_elements(observations) o where o->>'channel_id'=v->>'channel_id' and (
    o->>'parent_id' is distinct from v->>'parent_id' or o->>'channel_type' is distinct from v->>'channel_type'
    or o->>'title' is distinct from v->>'title'
    or o ? 'access_status' and o->>'access_status' is distinct from v->>'access_status'
    or o ? 'eligible' and o->'eligible' is distinct from v->'eligible'))
   or parents_loaded and coalesce(v->>'channel_type','') not in ('10','11','12') and not exists(
    select 1 from jsonb_array_elements(p_state->'parents') o where o->>'id'=v->>'channel_id')
  union
  select v->>'channel_id' from jsonb_array_elements(catalogue) v join changed c on v->>'parent_id'=c.id
 ) select coalesce(array_agg(distinct id),'{}'::text[]) into withdrawn from changed;
 catalogue:=(select coalesce(jsonb_agg(case when v->>'channel_id'=any(withdrawn) then
  v||jsonb_build_object('enabled',false,'source_status','disabled','discovery_withdrawn',true) else v end
  order by v->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(catalogue) v);

 -- A later snapshot can also contradict an already checked staging node. Do
 -- not let completion promote that stale observation. A fresh explicit check
 -- may clear its marker, but must agree with the persisted snapshots again.
 select coalesce(array_agg(distinct v->>'channel_id'),'{}'::text[]) into invalid_staging
 from jsonb_array_elements(staging) v where
  exists(select 1 from jsonb_array_elements(observations) o where o->>'channel_id'=v->>'channel_id' and (
   o->>'parent_id' is distinct from v->>'parent_id' or o->>'channel_type' is distinct from v->>'channel_type'
   or o->>'title' is distinct from v->>'title'
   or o ? 'access_status' and o->>'access_status' is distinct from v->>'access_status'
   or o ? 'eligible' and o->'eligible' is distinct from v->'eligible'))
  or parents_loaded and coalesce(v->>'channel_type','') not in ('10','11','12') and not exists(
   select 1 from jsonb_array_elements(p_state->'parents') o where o->>'id'=v->>'channel_id');
 staging:=(select coalesce(jsonb_agg(case when v->>'channel_id'=any(invalid_staging) then
  v||jsonb_build_object('discovery_withdrawn',true) else v end order by v->>'channel_id'),'[]'::jsonb)
  from jsonb_array_elements(staging) v);

 update public.discord_view_policies set channels=catalogue,discovery_state=jsonb_build_object(
  'guild_id',p_guild_id,'policy_revision',policy.revision,'generation',generation,'state',p_state,'updated_at',now(),
  'published',policy.discovery_state->'published','staging_channels',staging),updated_at=now()
 where guild_id=p_guild_id;
 return true;
end $$;

create or replace function public.discord_complete_discovery(p_guild_id text,p_generation uuid,p_expected_policy_revision bigint,p_expected_state jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;catalogue jsonb;staging jsonb;n jsonb;allowed boolean;
begin
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into policy from public.discord_view_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.discovery_enabled or policy.revision is distinct from p_expected_policy_revision
  or policy.discovery_state->>'policy_revision' is distinct from policy.revision::text
  or (policy.discovery_state->>'generation')::uuid is distinct from p_generation
  or policy.discovery_state->'state' is distinct from p_expected_state
  or policy.discovery_state->'state'->>'phase'='complete'
  or jsonb_typeof(policy.discovery_state->'staging_channels') is distinct from 'array' then return false;end if;
 -- A CAS match alone is not completion: all parent checks, active-thread checks
 -- and archive tasks must have finished at the saved checkpoint. The collector
 -- clears activeThreads when it enters archives, retaining its consumed index.
 if p_expected_state->>'phase' is distinct from 'archives'
  or p_expected_state->'channelsLoaded' is distinct from 'true'::jsonb
  or jsonb_typeof(p_expected_state->'parents') is distinct from 'array'
  or jsonb_typeof(p_expected_state->'tasks') is distinct from 'array'
  or p_expected_state->'activeThreads' is distinct from '[]'::jsonb
  or coalesce(p_expected_state->>'channelIndex','') !~ '^[0-9]{1,6}$'
  or coalesce(p_expected_state->>'activeIndex','') !~ '^[0-9]{1,6}$'
  or coalesce(p_expected_state->>'taskIndex','') !~ '^[0-9]{1,6}$' then return false;end if;
 if (p_expected_state->>'channelIndex')::integer<>jsonb_array_length(p_expected_state->'parents')
  or (p_expected_state->>'taskIndex')::integer<>jsonb_array_length(p_expected_state->'tasks') then return false;end if;
 if jsonb_typeof(p_state) is distinct from 'object' or p_state->>'phase' is distinct from 'complete'
  or (p_state->>'generation')::uuid is distinct from p_generation
  or (p_state->>'policyRevision')::bigint is distinct from policy.revision
  or (p_state-'phase'-'completedAt') is distinct from (p_expected_state-'phase'-'completedAt') then raise check_violation using message='Invalid completion';end if;
 staging:=policy.discovery_state->'staging_channels';catalogue:='[]'::jsonb;
 for n in select jsonb_array_elements(staging) loop
  allowed:=public.discord_catalogue_metadata_allowed(staging,n->>'channel_id',p_generation::text,
   policy.excluded_category_ids,policy.excluded_channel_ids);
  -- Existing identities/manual intent survive every generation; new identities
  -- are allocated only for validated sources at the atomic publication boundary.
  if allowed and n->>'source_id' is null then n:=n||jsonb_build_object('source_id',gen_random_uuid());end if;
  catalogue:=catalogue||jsonb_build_array(n||jsonb_build_object('enabled',allowed and n->>'source_id' is not null,
   'source_status',case when allowed and n->>'source_id' is not null and not policy.paused then 'active' else 'disabled' end));
 end loop;
 update public.discord_view_policies set channels=catalogue,discovery_state=jsonb_build_object(
  'guild_id',p_guild_id,'policy_revision',policy.revision,'generation',p_generation,'state',p_state,'updated_at',now(),
  'published',jsonb_build_object('generation',p_generation,'policy_revision',policy.revision),'staging_channels','[]'::jsonb),
  last_discovery_at=now(),updated_at=now() where guild_id=p_guild_id;
 return true;
end $$;

-- Existing RPC signatures, SECURITY INVOKER and service-only ACLs survive
-- CREATE OR REPLACE. No table/column/RLS change or source-content storage.
notify pgrst,'reload schema';
commit;
