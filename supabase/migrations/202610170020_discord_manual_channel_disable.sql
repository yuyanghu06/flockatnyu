-- M36: make an explicit admin channel disable survive metadata discovery.
-- Store operator intent inside the existing catalogue JSONB; blacklist policy
-- remains independent. No source identity, table, column or grant is replaced.
begin;
select pg_advisory_xact_lock(hashtext('discord-catalogue'));
lock table public.discord_view_policies in share row exclusive mode;

-- Only infer old manual intent where the node is eligible, disabled and allowed
-- by the current hierarchy/blacklist. A current in-flight generation disables
-- every node temporarily, so that state is not evidence of an admin disable.
-- Nodes absent from that discovery generation also carry no current evidence.
-- configure_channel invalidates the previous discovery revision, allowing its
-- explicit enabled=false setting to be recovered before the next refresh.
update public.discord_view_policies p set channels=(
 select coalesce(jsonb_agg(case when not (n ? 'manual_disabled')
  and n->'enabled'='false'::jsonb and n->'eligible'='true'::jsonb
  and n->>'generation'=p.discovery_state->>'generation'
  and public.discord_channel_allowed(p.guild_id,n->>'channel_id',true)
  and not (coalesce((p.discovery_state->>'policy_revision')::bigint=p.revision,false)
   and p.discovery_state->'state'->>'phase' is distinct from 'complete')
 then n||jsonb_build_object('manual_disabled',true) else n end
 order by n->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(p.channels) n);

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
   'enabled',(p_channel->>'enabled')::boolean,'manual_disabled',not (p_channel->>'enabled')::boolean,'backfill_from',coalesce((p_channel->>'backfill_from')::timestamptz,policy.backfill_from),
   'policy_revision',policy.revision+1,'updated_at',now(),'source_status','disabled');
 -- Any operator channel change invalidates in-flight live reads and discovery.
 -- The next complete generation republishes eligible sources under this revision.
 update public.discord_view_policies set revision=policy.revision+1,channels=(select coalesce(jsonb_agg(
  n||jsonb_build_object('policy_revision',policy.revision+1,'source_status','disabled') order by n->>'channel_id'),'[]'::jsonb)
  from (select n from jsonb_array_elements(policy.channels) n where n->>'channel_id'<>cid union all select result) entries),updated_at=now() where guild_id=gid;
 return result;
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
  not coalesce((n->>'manual_disabled')::boolean,false) and n->>'source_id' is not null and n->>'generation'=p_generation::text and public.discord_channel_allowed(p_guild_id,n->>'channel_id',true),
  'source_status',case when not policy.paused and not coalesce((n->>'manual_disabled')::boolean,false) and n->>'source_id' is not null and n->>'generation'=p_generation::text
   and public.discord_channel_allowed(p_guild_id,n->>'channel_id',true) then 'active' else 'disabled' end)
  order by n->>'channel_id'),'[]'::jsonb) from jsonb_array_elements(policy.channels) n);
 update public.discord_view_policies set channels=catalogue,discovery_state=jsonb_build_object(
  'guild_id',p_guild_id,'policy_revision',policy.revision,'generation',p_generation,'state',p_state,'updated_at',now()),
  last_discovery_at=now(),updated_at=now() where guild_id=p_guild_id;
 return true;
end $$;

-- CREATE OR REPLACE preserves the existing invoker/service-only function ACLs.
-- persist_discovery already merges the prior node and therefore retains the flag.
notify pgrst,'reload schema';
commit;
