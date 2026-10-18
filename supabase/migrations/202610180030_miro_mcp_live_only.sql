-- Miro content is now read live through MCP. Preserve only the existing source
-- identity, independent enable flag and optional operator team restriction.
-- Earlier migrations are immutable; no snapshot, receipt or sync state survives.
begin;

-- Old sync publication locks source then board. Match that order and exclude
-- concurrent configuration/publication changes throughout validation and cutover.
lock table public.knowledge_sources in access exclusive mode;
lock table public.miro_boards in access exclusive mode;

do $$
begin
  -- Never repair identity mismatches by allocating a replacement source UUID or
  -- matching a board through its title. An anomaly aborts the whole transaction.
  if exists (
    select 1 from public.miro_boards b
    left join public.knowledge_sources s on s.id=b.source_id
    where s.id is null or s.kind is distinct from 'miro'
      or s.external_id is distinct from b.board_id
  ) or exists (
    select 1 from public.knowledge_sources s
    left join public.miro_boards b on b.source_id=s.id and b.board_id=s.external_id
    where s.kind='miro' and b.board_id is null
  ) then
    raise check_violation using message='Miro source/board identity mismatch; migration aborted';
  end if;
end $$;

alter table public.knowledge_sources add column miro_scope jsonb;

-- Copy configuration only. Source UUID, status, title, URL and timestamps are
-- untouched; paused boards and disabled/error sources remain independently so.
update public.knowledge_sources s
set miro_scope=jsonb_build_object('enabled',b.enabled,'team_id',b.team_id)
from public.miro_boards b
where s.id=b.source_id and s.kind='miro' and s.external_id=b.board_id;

alter table public.knowledge_sources
  add constraint knowledge_sources_miro_scope_kind_check
    check ((kind='miro')=(miro_scope is not null)),
  add constraint knowledge_sources_miro_board_id_check
    check (kind<>'miro' or external_id ~ '^[A-Za-z0-9_=-]{1,200}$'),
  add constraint knowledge_sources_miro_scope_shape_check
    check (miro_scope is null or case when jsonb_typeof(miro_scope)='object' then
      coalesce(
        octet_length(miro_scope::text)<=512
        and miro_scope ?& array['enabled','team_id']
        and miro_scope-array['enabled','team_id']='{}'::jsonb
        and jsonb_typeof(miro_scope->'enabled')='boolean'
        and (miro_scope->'team_id'='null'::jsonb
          or (jsonb_typeof(miro_scope->'team_id')='string'
            and miro_scope->>'team_id' ~ '^[A-Za-z0-9_=-]{1,200}$')),
        false)
      else false end);

-- Validate the complete metadata backfill before removing any old storage.
do $$
begin
  if (select count(*) from public.miro_boards)
      <> (select count(*) from public.knowledge_sources where kind='miro')
    or exists (
      select 1 from public.miro_boards b
      join public.knowledge_sources s on s.id=b.source_id
      where s.miro_scope is distinct from jsonb_build_object('enabled',b.enabled,'team_id',b.team_id)
    ) then
    raise check_violation using message='Miro metadata backfill mismatch; migration aborted';
  end if;
end $$;

-- Preserve the established service-only wire signature. p_member_id is retained
-- for compatibility; this is the shared assistant, with server source allowlists.
-- This function returns registry configuration, never cached content/freshness.
create or replace function public.miro_authorized_board(p_member_id text,p_allowed_source_ids uuid[],p_board_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('board_id',s.external_id,'source_id',s.id,
    'team_id',s.miro_scope->'team_id','enabled',s.miro_scope->'enabled',
    'title',s.title,'url','https://miro.com/app/board/'||s.external_id||'/')
  from public.knowledge_sources s
  where s.kind='miro' and s.external_id=p_board_id and s.status='active'
    and s.miro_scope->'enabled'='true'::jsonb
    and s.id=any(p_allowed_source_ids)
    and cardinality(p_allowed_source_ids) between 1 and 1000;
$$;

-- Explicit caller-before-callee retirement: no broad dependency removal.
drop trigger miro_source_config_guard on public.knowledge_sources;
drop trigger miro_board_config_guard on public.miro_boards;
drop function public.miro_get_authorized_board(text,uuid[],text);
drop function public.miro_sync_register(text,text);
drop function public.miro_sync_claim(text,integer);
drop function public.miro_sync_renew(text,uuid,bigint,integer);
drop function public.miro_sync_finish(text,uuid,bigint,jsonb,text);
drop function public.miro_sync_fail(text,uuid,bigint,text);
drop function public.miro_sync_locked_board(text);
drop function public.miro_sync_source_guard();
drop function public.miro_sync_config_guard();
drop table public.miro_boards;

comment on column public.knowledge_sources.miro_scope is 'Metadata only for live Miro MCP access: exact enabled boolean and nullable team_id. Board ID is external_id; source status stays independent. No content, sync state or snapshot storage.';

-- The new column inherits existing service-role table privileges. Repeat the
-- deny-by-default browser boundary; no policy or broader member grant is added.
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_sources force row level security;
revoke all on table public.knowledge_sources from public,anon,authenticated;
revoke all on function public.miro_authorized_board(text,uuid[],text) from public,anon,authenticated;
grant execute on function public.miro_authorized_board(text,uuid[],text) to service_role;

notify pgrst,'reload schema';
commit;
