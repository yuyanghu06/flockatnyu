-- Publish fresh event-local channel metadata without waiting for unrelated archive
-- inventory. Existing publication proof, source identities and operator intent
-- remain authoritative; the RPC is callable only by the collector service.
begin;
create function public.discord_event_metadata_snapshot(p_guild_id text,p_expected_policy_revision bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('generation',p.discovery_state->'published'->>'generation',
  'published',coalesce((select jsonb_object_agg(n->>'channel_id',md5(n::text)) from jsonb_array_elements(p.channels) n),'{}'::jsonb),
  'staging',coalesce((select jsonb_object_agg(n->>'channel_id',md5(n::text)) from jsonb_array_elements(coalesce(p.discovery_state->'staging_channels','[]'::jsonb)) n),'{}'::jsonb))
 from public.discord_view_policies p where p.guild_id=p_guild_id and p.revision=p_expected_policy_revision
  and not p.paused and p.discovery_enabled and p.discovery_state->'published'->>'policy_revision'=p.revision::text;
$$;
revoke all on function public.discord_event_metadata_snapshot(text,bigint) from public,anon,authenticated;
grant execute on function public.discord_event_metadata_snapshot(text,bigint) to service_role;

create function public.discord_reconcile_event_metadata(
 p_guild_id text,p_expected_policy_revision bigint,p_channel_id text,p_channels jsonb,p_withdraw boolean,p_expected_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_view_policies;published jsonb;catalogue jsonb;original jsonb;old jsonb;n jsonb;node jsonb;
 current_id text:=p_channel_id;visited text[]:='{}';observed text[]:='{}';changed text[]:='{}';withdrawn text[]:='{}';
 generation text;allowed boolean;changed_catalogue boolean;next_state jsonb;staged jsonb;expected_id text;relevant text[];
begin
 if p_guild_id is null or p_guild_id !~ '^[0-9]{1,20}$' or p_channel_id is null or p_channel_id !~ '^[0-9]{1,20}$'
  or p_expected_policy_revision is null or p_expected_policy_revision<1 or p_withdraw is null
  or jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>3
  or octet_length(p_channels::text)>10000 or p_withdraw and p_channels<>'[]'::jsonb
  or not p_withdraw and jsonb_array_length(p_channels)=0 then raise check_violation using message='Invalid event metadata';end if;
 perform pg_advisory_xact_lock(hashtext('discord-catalogue'));
 select * into policy from public.discord_view_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.discovery_enabled or policy.paused
  or policy.revision is distinct from p_expected_policy_revision then return null;end if;
 published:=policy.discovery_state->'published';generation:=published->>'generation';
 if jsonb_typeof(published) is distinct from 'object' or published->>'policy_revision' is distinct from policy.revision::text
  or coalesce(generation,'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then return null;end if;
 if jsonb_typeof(p_expected_snapshot) is distinct from 'object' or p_expected_snapshot->>'generation' is distinct from generation
  or jsonb_typeof(p_expected_snapshot->'published') is distinct from 'object' or jsonb_typeof(p_expected_snapshot->'staging') is distinct from 'object' then return null;end if;
 catalogue:=policy.channels;original:=catalogue;
 with recursive prior_ancestors(id,path) as (
  select p_channel_id,array[p_channel_id]
  union all
  select v->>'parent_id',a.path||(v->>'parent_id') from prior_ancestors a
   join lateral jsonb_array_elements(catalogue) v on v->>'channel_id'=a.id
   where v->>'parent_id' is not null and cardinality(a.path)<9 and not(v->>'parent_id'=any(a.path))
 ) select array_agg(distinct id) into relevant from (select id from prior_ancestors union select v->>'channelId' from jsonb_array_elements(p_channels) v) ids;
 foreach expected_id in array relevant loop
  select v into old from jsonb_array_elements(catalogue) v where v->>'channel_id'=expected_id;
  select v into staged from jsonb_array_elements(coalesce(policy.discovery_state->'staging_channels','[]'::jsonb)) v where v->>'channel_id'=expected_id;
  if p_expected_snapshot->'published'->>expected_id is distinct from md5(old::text)
   or p_expected_snapshot->'staging'->>expected_id is distinct from md5(staged::text) then return null;end if;
 end loop;
 if p_withdraw then changed:=array[p_channel_id];
 else
  for n in select jsonb_array_elements(p_channels) loop
   if n->>'channelId' is null or n->>'channelId' !~ '^[0-9]{1,20}$' or n->>'guildId' is distinct from p_guild_id
    or coalesce(n->>'parentId','0') !~ '^[0-9]{1,20}$' or coalesce(n->>'type','') not in ('0','4','5','10','11','12','15','16')
    or coalesce(n->>'accessStatus','') not in ('metadata','ready','excluded','unknown_ancestry','permission_denied','not_found')
    or jsonb_typeof(n->'eligible') is distinct from 'boolean' or length(trim(coalesce(n->>'title',''))) not between 1 and 300
    or n->>'channelId'=any(observed) then raise check_violation using message='Invalid event metadata node';end if;
   observed:=array_append(observed,n->>'channelId');
   if exists(select 1 from public.discord_view_policies p
    cross join lateral jsonb_array_elements(p.channels||coalesce(p.discovery_state->'staging_channels','[]'::jsonb)) v
    where p.guild_id<>p_guild_id and v->>'channel_id'=n->>'channelId') then raise check_violation using message='Channel guild mismatch';end if;
  end loop;
  -- Every supplied node must be in this exact target's ancestry. No unrelated
  -- channel can acquire a source UUID through an event for a different channel.
  loop
   select v into n from jsonb_array_elements(p_channels) v where v->>'channelId'=current_id;
   if n is null or current_id=any(visited) then raise check_violation using message='Invalid event metadata ancestry';end if;
   visited:=array_append(visited,current_id);current_id:=n->>'parentId';
   if current_id is null then exit;end if;
  end loop;
  if cardinality(visited)<>jsonb_array_length(p_channels) then raise check_violation using message='Unrelated event metadata';end if;
  for n in select jsonb_array_elements(p_channels) loop
   select v into old from jsonb_array_elements(catalogue) v where v->>'channel_id'=n->>'channelId';
   -- A targeted observation supersedes only matching fresh facts. Old descendants
   -- are withdrawn on any change, and never silently reenabled through a parent.
   if old is null or old->>'parent_id' is distinct from n->>'parentId' or old->>'channel_type' is distinct from n->>'type'
    or old->>'title' is distinct from n->>'title' or old->>'access_status' is distinct from n->>'accessStatus'
    or old->'eligible' is distinct from n->'eligible' or coalesce((old->>'discovery_withdrawn')::boolean,false)
    then changed:=array_append(changed,n->>'channelId');end if;
  end loop;
 end if;
 with recursive affected(id) as (
  select unnest(changed)
  union
  select v->>'channel_id' from jsonb_array_elements(catalogue) v join affected a on v->>'parent_id'=a.id
 ) select coalesce(array_agg(distinct id),'{}'::text[]) into withdrawn from affected;
 catalogue:=(select coalesce(jsonb_agg(case when v->>'channel_id'=any(withdrawn) then
  v||jsonb_build_object('enabled',false,'source_status','disabled','discovery_withdrawn',true) else v end order by v->>'channel_id'),'[]'::jsonb)
  from jsonb_array_elements(catalogue) v);
 if not p_withdraw then
  for n in select jsonb_array_elements(p_channels) loop
   select v into old from jsonb_array_elements(catalogue) v where v->>'channel_id'=n->>'channelId';
   select v into staged from jsonb_array_elements(coalesce(policy.discovery_state->'staging_channels','[]'::jsonb)) v where v->>'channel_id'=n->>'channelId';
   if old->>'source_id' is not null and staged->>'source_id' is not null and old->>'source_id' is distinct from staged->>'source_id' then return null;end if;
   node:=coalesce(old,'{}'::jsonb)||jsonb_build_object('channel_id',n->>'channelId','guild_id',p_guild_id,
    'parent_id',n->>'parentId','channel_type',(n->>'type')::integer,'access_status',n->>'accessStatus','eligible',(n->>'eligible')::boolean,
    'generation',generation,'title',n->>'title','enabled',false,'source_status','disabled','discovery_withdrawn',false,
    'source_id',coalesce(old->>'source_id',staged->>'source_id'),
    'backfill_from',coalesce((old->>'backfill_from')::timestamptz,policy.backfill_from),
    'policy_revision',policy.revision);
   if coalesce((old->>'manual_disabled')::boolean,false) or coalesce((staged->>'manual_disabled')::boolean,false) then node:=node||jsonb_build_object('manual_disabled',true);end if;
   catalogue:=(select coalesce(jsonb_agg(v order by v->>'channel_id'),'[]'::jsonb) from
    (select v from jsonb_array_elements(catalogue) v where v->>'channel_id'<>n->>'channelId' union all select node) entries);
  end loop;
  -- Validation runs on the entire checked ancestry before source allocation.
  -- metadata_allowed verifies types, permissions, exclusions and manual disables.
  for n in select v from jsonb_array_elements(catalogue) v where v->>'channel_id'=any(observed) loop
   allowed:=public.discord_catalogue_metadata_allowed(catalogue,n->>'channel_id',generation,policy.excluded_category_ids,policy.excluded_channel_ids);
   if allowed and n->>'channel_id'=p_channel_id and n->>'source_id' is null then n:=n||jsonb_build_object('source_id',gen_random_uuid());end if;
   node:=n||jsonb_build_object('enabled',allowed and n->>'source_id' is not null,
    'source_status',case when allowed and n->>'source_id' is not null then 'active' else 'disabled' end);
   catalogue:=(select coalesce(jsonb_agg(case when v->>'channel_id'=node->>'channel_id' then node else v end order by v->>'channel_id'),'[]'::jsonb)
    from jsonb_array_elements(catalogue) v);
  end loop;
 end if;
 changed_catalogue:=catalogue is distinct from original;next_state:=policy.discovery_state;
 if changed_catalogue and jsonb_typeof(next_state->'state')='object' and next_state->'state'->>'phase'<>'complete' then
  next_state:=jsonb_set(next_state,'{state,restartRequired}','true'::jsonb);
 end if;
 if changed_catalogue then
  update public.discord_view_policies set channels=catalogue,discovery_state=next_state,updated_at=now() where guild_id=p_guild_id;
 end if;
 return jsonb_build_object('status','ready','allowed',public.discord_channel_allowed(p_guild_id,p_channel_id));
end $$;
revoke all on function public.discord_reconcile_event_metadata(text,bigint,text,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.discord_reconcile_event_metadata(text,bigint,text,jsonb,boolean,jsonb) to service_role;

-- Preserve full inventory publication checks while fencing superseded scans.
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
 if prior_generation is not null and ((generation is distinct from prior_generation and prior_state->>'phase' is distinct from 'complete' and not coalesce((prior_state->>'restartRequired')::boolean,false))
  or (generation=prior_generation and (prior_state->>'phase'='complete' or coalesce((prior_state->>'restartRequired')::boolean,false)))) then return false;end if;
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
  or coalesce((policy.discovery_state->'state'->>'restartRequired')::boolean,false)
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

notify pgrst,'reload schema';
commit;
