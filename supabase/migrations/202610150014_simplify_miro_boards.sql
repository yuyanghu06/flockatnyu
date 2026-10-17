-- M28: one row per Miro board, with all original board content in data JSONB.
-- Migration 012 is immutable. Source ACLs, config revisions, service-only access
-- and atomic leased publication remain unchanged; no Miro writes or new grants.
begin;
lock table public.miro_boards in access exclusive mode;
alter table public.miro_boards rename column snapshot to data;
alter table public.miro_boards drop constraint miro_boards_check1;
alter table public.miro_boards rename constraint miro_boards_snapshot_check to miro_boards_data_check;
alter table public.miro_boards add constraint miro_boards_data_provenance_check
  check ((data is null and last_success_at is null and snapshot_config_revision is null)
    or (data is not null and last_success_at is not null and snapshot_config_revision is not null));


create or replace function public.miro_sync_config_guard()
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
  return new;
end $$;

create or replace function public.miro_sync_register(p_board_id text,p_team_id text default null)
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
  insert into public.miro_boards(board_id,source_id,team_id)
    values(p_board_id,sid,p_team_id)
    returning * into b;
  -- Deliberately no knowledge_source_members insertion, and no reactivation.
  return to_jsonb(b);
end $$;

create or replace function public.miro_sync_claim(p_board_id text,p_lease_seconds integer default 900)
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
    status='running',error_code=null
    where board_id=p_board_id returning * into b;
  -- Avoid sending the previous large snapshot to every worker claim.
  return to_jsonb(b)-'data';
end $$;

-- Keep p_snapshot/p_content_hash for compatibility with the deployed worker.
-- The hash is validated but no longer persisted as a redundant column.
create or replace function public.miro_sync_finish(p_board_id text,p_lease_token uuid,p_config_revision bigint,p_snapshot jsonb,p_content_hash text)
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
  update public.miro_boards set data=p_snapshot,snapshot_config_revision=config_revision,
    last_success_at=clock_timestamp(),status='succeeded',error_code=null,lease_token=null,lease_expires_at=null
    where board_id=p_board_id and lease_expires_at>clock_timestamp();
  get diagnostics changed=row_count;
  if changed=0 then return false; end if;
  update public.knowledge_sources set title=coalesce(nullif(left(p_snapshot->'board'->>'name',300),''),p_board_id),
    updated_at=clock_timestamp() where id=b.source_id;
  return true;
end $$;

create or replace function public.miro_authorized_board(p_member_id text,p_allowed_source_ids uuid[],p_board_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('board_id',b.board_id,'source_id',b.source_id,'team_id',b.team_id,
    'title',coalesce(nullif(left(b.data->'board'->>'name',300),''),s.title,b.board_id),
    'url','https://miro.com/app/board/'||b.board_id||'/',
    'last_success_at',b.last_success_at,'status',b.status)
  from public.miro_boards b
  join public.knowledge_sources s on s.id=b.source_id
  join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
  where b.board_id=p_board_id and b.enabled and s.kind='miro' and s.external_id=b.board_id and s.status='active'
    and s.id=any(p_allowed_source_ids) and cardinality(p_allowed_source_ids) between 1 and 1000
    and length(p_member_id) between 1 and 128;
$$;

create or replace function public.miro_get_authorized_board(p_member_id text,p_allowed_source_ids uuid[],p_board_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select (to_jsonb(b)-'lease_token'-'lease_expires_at')
    || jsonb_build_object('title',a.metadata->>'title','url',a.metadata->>'url')
  from public.miro_boards b
  cross join lateral (select public.miro_authorized_board(p_member_id,p_allowed_source_ids,p_board_id) metadata) a
  where b.board_id=p_board_id and a.metadata is not null
    and b.data is not null and b.snapshot_config_revision=b.config_revision
    and b.status not in ('blocked','auth_required','disabled');
$$;

-- Explicit drops only. Data is renamed in place, never rewritten or truncated.
alter table public.miro_boards
  drop column verified_team_id,
  drop column title,
  drop column url,
  drop column content_hash,
  drop column snapshot_version,
  drop column item_count,
  drop column connector_count,
  drop column group_count,
  drop column tag_count,
  drop column coverage,
  drop column capture_started_at,
  drop column capture_finished_at,
  drop column last_attempt_at,
  drop column created_at,
  drop column updated_at;

-- CREATE OR REPLACE preserves the existing function grants from migration 012.
-- Unchanged lock/renew/fail RPCs use the retained fields and composite row type.
notify pgrst,'reload schema';
commit;
