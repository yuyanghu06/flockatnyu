-- Bounded service-only metadata read for an explicitly requested worker run.
-- This does not publish channels, invent source identities, import messages or
-- modify blacklist/manual-disable/discovery policy.
begin;
create function public.discord_manual_scope_metadata(p_guild_id text,p_channel_ids text[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare policy public.discord_view_policies;result jsonb;
begin
 if p_guild_id is null or p_guild_id !~ '^[0-9]{1,20}$'
  or p_channel_ids is null or cardinality(p_channel_ids) not between 1 and 30
  or exists(select 1 from unnest(p_channel_ids) v where v is null or v !~ '^[0-9]{1,20}$')
  or (select count(distinct v) from unnest(p_channel_ids) v)<>cardinality(p_channel_ids)
  then raise check_violation using message='Invalid manual Discord scope';end if;
 select * into policy from public.discord_view_policies where guild_id=p_guild_id;
 if policy.guild_id is null then return null;end if;
 with recursive ancestry(id,path,depth) as (
  select v,array[v],0 from unnest(p_channel_ids) v
  union all
  select n->>'parent_id',a.path||(n->>'parent_id'),a.depth+1 from ancestry a
   cross join lateral jsonb_array_elements(policy.channels) n
   where n->>'channel_id'=a.id and n->>'parent_id' is not null
    and a.depth<8 and not (n->>'parent_id'=any(a.path))
 ), nodes as (
  select n from jsonb_array_elements(policy.channels) n
  where n->>'channel_id' in(select id from ancestry)
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'channel_id',n->>'channel_id','guild_id',policy.guild_id,'parent_id',n->>'parent_id',
  'channel_type',n->'channel_type','source_id',n->>'source_id','title',left(n->>'title',300),
  'manual_disabled',coalesce(n->'manual_disabled','false'::jsonb),
  'discovery_withdrawn',coalesce(n->'discovery_withdrawn','false'::jsonb),
  'access_status',n->>'access_status','generation',n->>'generation','policy_revision',n->'policy_revision'
 ) order by n->>'channel_id'),'[]'::jsonb) into result from nodes;
 return jsonb_build_object('guild_id',policy.guild_id,'policy_revision',policy.revision,
  'paused',policy.paused,'discovery_enabled',policy.discovery_enabled,
  'published_generation',policy.discovery_state->'published'->>'generation',
  'published_revision',policy.discovery_state->'published'->'policy_revision','nodes',result);
end $$;
revoke all on function public.discord_manual_scope_metadata(text,text[]) from public,anon,authenticated;
grant execute on function public.discord_manual_scope_metadata(text,text[]) to service_role;
comment on function public.discord_manual_scope_metadata(text,text[]) is
 'Metadata-only exact-channel manual worker view. Does not grant ordinary Discord access or write source identities.';
commit;
