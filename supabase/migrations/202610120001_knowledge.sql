-- Local migration only; intentionally not applied to any cloud project.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('google_calendar','discord','google_drive','manual')),
  external_id text not null,
  title text not null,
  original_url text,
  status text not null default 'disabled' check (status in ('disabled','active','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kind,external_id)
);
create table public.knowledge_source_members (
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  member_id text not null check (member_id='local-development' or member_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  can_read boolean not null default false,
  can_write boolean not null default false,
  primary key(source_id,member_id)
);
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  external_id text not null check(length(external_id) between 1 and 500),
  source_version text not null check(length(source_version) between 1 and 200),
  title text not null check(length(title) between 1 and 300),
  url text not null check(url ~ '^https?://'),
  original_text text not null check(length(original_text)<=200000),
  source_updated_at timestamptz not null,
  indexed_at timestamptz not null default now(),
  event_start_at timestamptz,
  event_end_at timestamptz,
  event_timezone text,
  building_id text,
  location_status text not null default 'unmapped' check(location_status in ('confirmed','uncertain','unmapped')),
  status text not null default 'active' check(status in ('active','deleted','error')),
  unique(id,source_id), unique(source_id,external_id)
);
create table public.knowledge_document_members (
  document_id uuid not null,
  source_id uuid not null,
  member_id text not null,
  can_read boolean not null default false,
  primary key(document_id,member_id),
  foreign key(document_id,source_id) references public.knowledge_documents(id,source_id) on delete cascade,
  foreign key(source_id,member_id) references public.knowledge_source_members(source_id,member_id) on delete cascade
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  ordinal integer not null check(ordinal>=0),
  original_text text not null check(length(original_text) between 1 and 2000),
  search_text tsvector generated always as (to_tsvector('english',original_text)) stored,
  embedding extensions.vector(1536),
  embedding_model text,
  embedding_provider text,
  indexed_at timestamptz not null default now(),
  check ((embedding is null and embedding_model is null and embedding_provider is null) or (embedding is not null and embedding_model is not null and embedding_provider is not null and length(trim(embedding_model))>0 and length(trim(embedding_provider))>0)),
  unique(document_id,ordinal)
);
create index knowledge_chunks_search on public.knowledge_chunks using gin(search_text);
create index knowledge_document_source on public.knowledge_documents(source_id,status);
create index knowledge_member_sources on public.knowledge_source_members(member_id,source_id);
create table public.knowledge_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  summary_date date not null,
  timezone text not null default 'America/New_York',
  original_document_ids uuid[] not null default '{}',
  summary_text text not null,
  allowed_member_ids text[] not null default '{}',
  status text not null default 'draft' check(status in ('draft','ready','error')),
  generated_at timestamptz not null default now(),
  unique(source_id,summary_date)
);
create table public.knowledge_sync_state (
  source_id uuid primary key references public.knowledge_sources(id) on delete cascade,
  cursor text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'not_started' check(status in ('not_started','running','succeeded','failed')),
  error_code text,
  updated_at timestamptz not null default now()
);
-- No policies: anon/authenticated deny by default. Only the trusted server role
-- can call guarded functions. No browser permission to the underlying tables.
DO $$ declare t text; begin
  foreach t in array array['knowledge_sources','knowledge_source_members','knowledge_documents','knowledge_document_members','knowledge_chunks','knowledge_daily_summaries','knowledge_sync_state'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;

create function public.knowledge_search(p_member_id text,p_allowed_source_ids uuid[],p_query text,p_limit integer default 5,p_building_id text default null)
returns table(id uuid,document_id uuid,source_id uuid,title text,url text,excerpt text,source_updated_at timestamptz,indexed_at timestamptz,building_id text)
language sql stable security invoker set search_path='' as $$
 select c.id,d.id,s.id,d.title,d.url,left(c.original_text,1800),d.source_updated_at,c.indexed_at,d.building_id
 from public.knowledge_chunks c
 join public.knowledge_documents d on d.id=c.document_id
 join public.knowledge_sources s on s.id=d.source_id
 join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
 join public.knowledge_document_members dm on dm.document_id=d.id and dm.member_id=p_member_id and dm.can_read
 where length(p_member_id) between 1 and 128 and cardinality(p_allowed_source_ids) between 1 and 100
 and s.id=any(p_allowed_source_ids) and s.status='active' and d.status='active'
 and length(trim(p_query)) between 1 and 500
 and (p_building_id is null or d.building_id=p_building_id)
 and c.search_text @@ websearch_to_tsquery('english',p_query)
 order by ts_rank(c.search_text,websearch_to_tsquery('english',p_query)) desc,c.id
 limit greatest(1,least(coalesce(p_limit,5),8));
$$;

create function public.knowledge_get_document(p_member_id text,p_allowed_source_ids uuid[],p_document_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(d) from public.knowledge_documents d
 join public.knowledge_sources s on s.id=d.source_id
 join public.knowledge_source_members sm on sm.source_id=s.id and sm.member_id=p_member_id and sm.can_read
 join public.knowledge_document_members dm on dm.document_id=d.id and dm.member_id=p_member_id and dm.can_read
 where d.id=p_document_id and s.id=any(p_allowed_source_ids) and cardinality(p_allowed_source_ids) between 1 and 100
 and s.status='active' and d.status='active';
$$;

create function public.knowledge_upsert_document(p_member_id text,p_allowed_source_ids uuid[],p_record jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid; did uuid; mid text; chunk text; i integer:=0;
begin
 sid:=(p_record->>'source_id')::uuid;
 if coalesce(cardinality(p_allowed_source_ids),0) not between 1 and 100 or not coalesce(sid=any(p_allowed_source_ids),false) or not exists(
   select 1 from public.knowledge_source_members sm join public.knowledge_sources s on s.id=sm.source_id
   where sm.source_id=sid and sm.member_id=p_member_id and sm.can_write and s.status='active'
 ) then raise insufficient_privilege using message='Source write denied'; end if;
 if jsonb_typeof(p_record->'allowed_member_ids') is distinct from 'array' or jsonb_typeof(p_record->'chunks') is distinct from 'array'
 or jsonb_array_length(p_record->'allowed_member_ids')>500 or jsonb_array_length(p_record->'chunks')>64
 or length(p_record->>'source_version') not between 1 and 200 then raise check_violation using message='Invalid record'; end if;
 for mid in select jsonb_array_elements_text(p_record->'allowed_member_ids') loop
   if not exists(select 1 from public.knowledge_source_members where source_id=sid and member_id=mid and can_read)
   then raise insufficient_privilege using message='Document ACL exceeds source permissions'; end if;
 end loop;
 insert into public.knowledge_documents(id,source_id,external_id,source_version,title,url,original_text,source_updated_at,building_id)
 values((p_record->>'id')::uuid,sid,p_record->>'external_id',p_record->>'source_version',p_record->>'title',p_record->>'url',p_record->>'original_text',(p_record->>'source_updated_at')::timestamptz,p_record->>'building_id')
 on conflict(source_id,external_id) do update set source_version=excluded.source_version,title=excluded.title,url=excluded.url,
 original_text=excluded.original_text,source_updated_at=excluded.source_updated_at,building_id=excluded.building_id,indexed_at=now(),status='active'
 returning id into did;
 delete from public.knowledge_document_members where document_id=did;
 insert into public.knowledge_document_members(document_id,source_id,member_id,can_read)
 select did,sid,value,true from (select distinct jsonb_array_elements_text(p_record->'allowed_member_ids') as value) a;
 delete from public.knowledge_chunks where document_id=did;
 for chunk in select jsonb_array_elements_text(p_record->'chunks') loop
   -- Stable document+ordinal identifiers for citations across source revisions.
   insert into public.knowledge_chunks(id,document_id,ordinal,original_text)
   values(overlay(overlay(md5(did::text||':'||i::text) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid,did,i,chunk); i:=i+1;
 end loop;
 return did;
end $$;

create function public.knowledge_delete_document(p_member_id text,p_allowed_source_ids uuid[],p_document_id uuid,p_source_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if coalesce(cardinality(p_allowed_source_ids),0) not between 1 and 100 or not coalesce(p_source_id=any(p_allowed_source_ids),false) or not exists(
 select 1 from public.knowledge_source_members sm join public.knowledge_sources s on s.id=sm.source_id
 where sm.source_id=p_source_id and sm.member_id=p_member_id and sm.can_write and s.status='active')
 then raise insufficient_privilege using message='Source write denied'; end if;
 delete from public.knowledge_documents where id=p_document_id and source_id=p_source_id;
 get diagnostics removed=row_count;return removed>0;
end $$;

revoke all on function public.knowledge_search(text,uuid[],text,integer,text) from public,anon,authenticated;
revoke all on function public.knowledge_get_document(text,uuid[],uuid) from public,anon,authenticated;
revoke all on function public.knowledge_upsert_document(text,uuid[],jsonb) from public,anon,authenticated;
revoke all on function public.knowledge_delete_document(text,uuid[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.knowledge_search(text,uuid[],text,integer,text) to service_role;
grant execute on function public.knowledge_get_document(text,uuid[],uuid) to service_role;
grant execute on function public.knowledge_upsert_document(text,uuid[],jsonb) to service_role;
grant execute on function public.knowledge_delete_document(text,uuid[],uuid,uuid) to service_role;
notify pgrst,'reload schema';



