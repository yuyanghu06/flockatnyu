-- M27: read-only Miro ingestion. Depends only on knowledge migration 001.
-- No Miro writes, model calls, embeddings, or member grants are introduced.
begin;

alter table public.knowledge_sources drop constraint knowledge_sources_kind_check;
alter table public.knowledge_sources add constraint knowledge_sources_kind_check
  check (kind in ('google_calendar','discord','google_drive','manual','miro'));

create table public.miro_boards (
  board_id text primary key check (board_id ~ '^[A-Za-z0-9_=-]{1,200}$'),
  source_id uuid not null unique references public.knowledge_sources(id) on delete cascade,
  -- Optional operator restriction; verified_team_id records the last capture.
  team_id text check (team_id is null or team_id ~ '^[A-Za-z0-9_=-]{1,200}$'),
  verified_team_id text,
  title text not null,
  url text not null check (url ~ '^https://miro.com/app/board/[A-Za-z0-9_=-]+/$'),
  enabled boolean not null default true,
  config_revision bigint not null default 1 check (config_revision > 0),
  snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot)='object'),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  snapshot_version bigint not null default 0 check (snapshot_version >= 0),
  snapshot_config_revision bigint,
  item_count integer not null default 0 check (item_count >= 0),
  connector_count integer not null default 0 check (connector_count >= 0),
  group_count integer not null default 0 check (group_count >= 0),
  tag_count integer not null default 0 check (tag_count >= 0),
  coverage jsonb not null default '{}',
  capture_started_at timestamptz,
  capture_finished_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started','running','succeeded','failed','blocked','auth_required','disabled')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((snapshot is null and snapshot_version=0 and content_hash is null and last_success_at is null)
    or (snapshot is not null and snapshot_version>0 and content_hash is not null
      and last_success_at is not null and snapshot_config_revision is not null))
);
alter table public.miro_boards enable row level security;
alter table public.miro_boards force row level security;
revoke all on table public.miro_boards from public,anon,authenticated;
grant select,insert,update,delete on table public.miro_boards to service_role;

-- Configuration changes invalidate even workers whose operator later restores the
-- old setting. Snapshot provenance remains intact; readers reject old revisions.
create function public.miro_sync_config_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.board_id is distinct from old.board_id or new.source_id is distinct from old.source_id then
    raise check_violation using message='Miro board/source identity is immutable';
  end if;
  if new.enabled is distinct from old.enabled or new.team_id is distinct from old.team_id
    or new.config_revision is distinct from old.config_revision then
    new.config_revision:=old.config_revision+1;
    new.lease_token:=null; new.lease_expires_at:=null;
    new.status:=case when new.enabled then 'not_started' else 'disabled' end;
    new.error_code:=null;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger miro_board_config_guard before update on public.miro_boards
  for each row execute function public.miro_sync_config_guard();

create function public.miro_sync_source_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status is distinct from old.status or new.kind is distinct from old.kind
    or new.external_id is distinct from old.external_id then
    update public.miro_boards set config_revision=config_revision+1
      where source_id=new.id;
  end if;
  return new;
end $$;
create trigger miro_source_config_guard after update of status,kind,external_id on public.knowledge_sources
  for each row execute function public.miro_sync_source_guard();

-- All state-changing RPCs lock source then board, also serializing source
-- pause/reconfiguration with publication. Never depend on a timestamp comparison.
create function public.miro_sync_locked_board(p_board_id text)
returns public.miro_boards language plpgsql security invoker set search_path='' as $$
declare b public.miro_boards; s public.knowledge_sources;
begin
  select * into b from public.miro_boards where board_id=p_board_id;
  if not found then return null; end if;
  select * into s from public.knowledge_sources where id=b.source_id for update;
  if not found or s.kind<>'miro' or s.external_id<>p_board_id or s.status<>'active' then return null; end if;
  select * into b from public.miro_boards where board_id=p_board_id for update;
  if not found or not b.enabled then return null; end if;
  return b;
end $$;

create function public.miro_sync_register(p_board_id text,p_team_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
  insert into public.miro_boards(board_id,source_id,team_id,title,url)
    values(p_board_id,sid,p_team_id,p_board_id,'https://miro.com/app/board/'||p_board_id||'/')
    returning * into b;
  -- Deliberately no knowledge_source_members insertion, and no reactivation.
  return to_jsonb(b);
end $$;

create function public.miro_sync_claim(p_board_id text,p_lease_seconds integer default 900)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.miro_boards;
begin
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise invalid_parameter_value using message='Invalid Miro lease duration';
  end if;
  b:=public.miro_sync_locked_board(p_board_id);
  if b.board_id is null or (b.lease_token is not null and b.lease_expires_at>clock_timestamp()) then return null; end if;
  update public.miro_boards set lease_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    last_attempt_at=clock_timestamp(),status='running',error_code=null
    where board_id=p_board_id returning * into b;
  -- Avoid sending the previous large snapshot to every worker claim.
  return to_jsonb(b)-'snapshot';
end $$;

create function public.miro_sync_renew(p_board_id text,p_lease_token uuid,p_config_revision bigint,p_lease_seconds integer default 900)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.miro_boards; changed integer;
begin
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise invalid_parameter_value using message='Invalid Miro lease duration';
  end if;
  b:=public.miro_sync_locked_board(p_board_id);
  if b.board_id is null or b.lease_token is distinct from p_lease_token or p_lease_token is null
    or b.config_revision is distinct from p_config_revision or b.lease_expires_at<=clock_timestamp() then return false; end if;
  update public.miro_boards set lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    where board_id=p_board_id and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create function public.miro_sync_finish(p_board_id text,p_lease_token uuid,p_config_revision bigint,p_snapshot jsonb,p_content_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.miro_boards; started timestamptz; finished timestamptz; k text; entry record; changed integer;
begin
  b:=public.miro_sync_locked_board(p_board_id);
  if b.board_id is null or b.lease_token is distinct from p_lease_token or p_lease_token is null
    or b.config_revision is distinct from p_config_revision or b.lease_expires_at<=clock_timestamp() then return false; end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(p_snapshot->'board') is distinct from 'object'
    or p_snapshot->'board'->>'id' is distinct from p_board_id
    or (b.team_id is not null and p_snapshot->'board'->'team'->>'id' is distinct from b.team_id)
    or jsonb_typeof(p_snapshot->'coverage') is distinct from 'object'
    or p_snapshot->'coverage'->'complete' is distinct from 'true'::jsonb
    or jsonb_typeof(p_snapshot->'itemTags') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'groupItems') is distinct from 'object'
    or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message='Invalid or incomplete Miro snapshot';
  end if;
  foreach k in array array['items','connectors','groups','tags'] loop
    if jsonb_typeof(p_snapshot->k) is distinct from 'array' then
      raise invalid_parameter_value using message='Invalid Miro snapshot collection';
    end if;
    if exists(select 1 from jsonb_array_elements(p_snapshot->k) a(value)
      where jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'id') is distinct from 'string' or length(value->>'id')=0)
      or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_snapshot->k)) then
      raise invalid_parameter_value using message='Invalid Miro snapshot object identities';
    end if;
    if p_snapshot->'coverage'->'counts' ? k
      and p_snapshot->'coverage'->'counts'->k is distinct from to_jsonb(jsonb_array_length(p_snapshot->k)) then
      raise invalid_parameter_value using message='Miro coverage count mismatch';
    end if;
  end loop;
  foreach k in array array['itemTags','groupItems'] loop
    for entry in select key,value from jsonb_each(p_snapshot->k) loop
      if length(entry.key)=0 or jsonb_typeof(entry.value) is distinct from 'array' then
        raise invalid_parameter_value using message='Invalid Miro relationship collection';
      end if;
      if exists(select 1 from jsonb_array_elements(entry.value) a(value)
        where jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'id') is distinct from 'string' or length(value->>'id')=0)
        or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(entry.value)) then
        raise invalid_parameter_value using message='Invalid Miro relationship identities';
      end if;
    end loop;
  end loop;
  if jsonb_typeof(p_snapshot->'captureStartedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'captureFinishedAt') is distinct from 'string'
    or p_snapshot->>'captureStartedAt' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
    or p_snapshot->>'captureFinishedAt' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then
    raise invalid_parameter_value using message='Invalid Miro capture timestamps';
  end if;
  begin
    started:=(p_snapshot->>'captureStartedAt')::timestamptz;
    finished:=(p_snapshot->>'captureFinishedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise invalid_parameter_value using message='Invalid Miro capture timestamps';
  end;
  if finished<started or finished>clock_timestamp()+interval '5 minutes' then
    raise invalid_parameter_value using message='Invalid Miro capture interval';
  end if;
  update public.miro_boards set snapshot=p_snapshot,content_hash=p_content_hash,
    snapshot_version=snapshot_version+1,snapshot_config_revision=config_revision,
    verified_team_id=p_snapshot->'board'->'team'->>'id',
    title=coalesce(nullif(left(p_snapshot->'board'->>'name',300),''),board_id),
    item_count=jsonb_array_length(p_snapshot->'items'),connector_count=jsonb_array_length(p_snapshot->'connectors'),
    group_count=jsonb_array_length(p_snapshot->'groups'),tag_count=jsonb_array_length(p_snapshot->'tags'),
    coverage=p_snapshot->'coverage',capture_started_at=started,capture_finished_at=finished,
    last_success_at=clock_timestamp(),status='succeeded',error_code=null,lease_token=null,lease_expires_at=null
    where board_id=p_board_id and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  if changed=0 then return false; end if;
  update public.knowledge_sources set title=coalesce(nullif(left(p_snapshot->'board'->>'name',300),''),p_board_id),
    updated_at=clock_timestamp() where id=b.source_id;
  return true;
end $$;

create function public.miro_sync_fail(p_board_id text,p_lease_token uuid,p_config_revision bigint,p_error_code text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.miro_boards; changed integer;
begin
  b:=public.miro_sync_locked_board(p_board_id);
  if b.board_id is null or b.lease_token is distinct from p_lease_token or p_lease_token is null
    or b.config_revision is distinct from p_config_revision or b.lease_expires_at<=clock_timestamp() then return false; end if;
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise invalid_parameter_value using message='Invalid Miro error code';
  end if;
  -- Retain the complete snapshot, counts, hash, version and last-success time.
  update public.miro_boards set status=case
      when p_error_code in ('auth_required','unauthorized','miro_http_401') then 'auth_required'
      when p_error_code in ('forbidden','not_found','inaccessible','access_denied','board_unavailable','miro_http_403','miro_http_404') then 'blocked'
      else 'failed' end,
    error_code=p_error_code,lease_token=null,lease_expires_at=null
    where board_id=p_board_id and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  return changed=1;
end $$;

-- Read-only assistant authorization is explicit and independent of whether an
-- initial snapshot has succeeded. A source allowlist alone is never sufficient.
create function public.miro_authorized_board(p_member_id text,p_allowed_source_ids uuid[],p_board_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('board_id',b.board_id,'source_id',b.source_id,'team_id',b.team_id,
    'title',b.title,'url',b.url,'last_success_at',b.last_success_at,'status',b.status)
  from public.miro_boards b
  join public.knowledge_sources s on s.id=b.source_id
  join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
  where b.board_id=p_board_id and b.enabled and s.kind='miro' and s.external_id=b.board_id and s.status='active'
    and s.id=any(p_allowed_source_ids) and cardinality(p_allowed_source_ids) between 1 and 1000
    and length(p_member_id) between 1 and 128;
$$;

create function public.miro_get_authorized_board(p_member_id text,p_allowed_source_ids uuid[],p_board_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(b)-'lease_token'-'lease_expires_at' from public.miro_boards b
  where b.board_id=p_board_id and public.miro_authorized_board(p_member_id,p_allowed_source_ids,p_board_id) is not null
    and b.snapshot is not null and b.snapshot_config_revision=b.config_revision
    and b.status not in ('blocked','auth_required','disabled');
$$;

-- Include helpers and trigger functions: no executable entry point for browsers.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'miro_sync_%'
      or p.proname in ('miro_authorized_board','miro_get_authorized_board')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
