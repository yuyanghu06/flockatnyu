-- Normalized source-backed activity. Stage 026 preserves the legacy columns;
-- stage 027 must be applied only after the application uses these RPCs.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
lock table public.map_buildings,public.map_people in share row exclusive mode;

create table public.events (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200 and length(name)<=200),
 notes text not null default '' check (length(notes)<=4000),
 kind text not null check (kind in ('presence','personal_plan','scheduled_event')),
 status text not null default 'confirmed' check (status in ('confirmed','tentative','cancelled','superseded')),
 time_kind text not null check (time_kind in ('timed','all_day','unknown')),
 starts_at timestamptz check (isfinite(starts_at)),
 ends_at timestamptz check (isfinite(ends_at)),
 starts_on date check (isfinite(starts_on)),
 ends_on date check (isfinite(ends_on)),
 time_zone text not null default 'America/New_York',
 source_id uuid not null,
 source_url text not null check (length(source_url) between 9 and 2048 and source_url ~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'),
 source_record_id text not null check (length(btrim(source_record_id)) between 1 and 200 and length(source_record_id)<=200),
 url text check (length(url) between 9 and 2048 and url ~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'),
 reported_at timestamptz not null check (isfinite(reported_at)),
 created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
 updated_at timestamptz not null default clock_timestamp() check (isfinite(updated_at)),
 unique(source_id,source_record_id),
 check ((time_kind='timed' and starts_at is not null and ends_at is not null and ends_at>starts_at and starts_on is null and ends_on is null)
  or (time_kind='all_day' and starts_on is not null and ends_on is not null and ends_on>starts_on and starts_at is null and ends_at is null)
  or (time_kind='unknown' and starts_at is null and ends_at is null and starts_on is null and ends_on is null))
);
create table public.event_buildings (
 event_id uuid not null references public.events(id) on delete cascade,
 building_id text not null references public.map_buildings(id) on delete restrict,
 location_notes text not null default '' check (length(location_notes)<=500),
 primary key(event_id,building_id)
);
create table public.event_people (
 event_id uuid not null references public.events(id) on delete cascade,
 person_id uuid not null references public.map_people(id) on delete restrict,
 attendance_status text not null default 'going' check (attendance_status in ('going','tentative','declined')),
 presence_basis text not null check (presence_basis in ('planned','reported')),
 label text not null default '' check (length(label)<=200),
 starts_at timestamptz check (isfinite(starts_at)),
 ends_at timestamptz check (isfinite(ends_at)),
 source_id uuid not null,
 source_url text not null check (length(source_url) between 9 and 2048 and source_url ~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'),
 reported_at timestamptz not null check (isfinite(reported_at)),
 created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
 updated_at timestamptz not null default clock_timestamp() check (isfinite(updated_at)),
 primary key(event_id,person_id)
);
create index event_buildings_building_idx on public.event_buildings(building_id,event_id);
create index event_people_person_idx on public.event_people(person_id,event_id);
create index events_timed_end_idx on public.events(ends_at) where time_kind='timed';
create index events_date_end_idx on public.events(ends_on) where time_kind='all_day';

-- Shared with profile/catalogue guards; all application event writes are serialized.
create function public.map_event_lock() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
 return null;
end $$;
create trigger events_lock before insert or update or delete on public.events for each statement execute function public.map_event_lock();
create trigger event_buildings_lock before insert or update or delete on public.event_buildings for each statement execute function public.map_event_lock();
create trigger event_people_lock before insert or update or delete on public.event_people for each statement execute function public.map_event_lock();

create function public.map_validate_event_person() returns trigger
language plpgsql security invoker set search_path='' as $$
declare parent public.events;start_at timestamptz;end_at timestamptz;effective_start timestamptz;effective_end timestamptz;
begin
 if tg_op='UPDATE' and (new.event_id<>old.event_id or new.person_id<>old.person_id) then
  raise check_violation using message='Participation identity cannot change';
 end if;
 select * into strict parent from public.events where id=new.event_id;
 if parent.time_kind='unknown' and (new.starts_at is not null or new.ends_at is not null) then
  raise check_violation using message='Unknown event time cannot have attendance overrides';
 end if;
 if parent.time_kind<>'unknown' then
  start_at:=case when parent.time_kind='timed' then parent.starts_at else parent.starts_on::timestamp at time zone parent.time_zone end;
  end_at:=case when parent.time_kind='timed' then parent.ends_at else parent.ends_on::timestamp at time zone parent.time_zone end;
  effective_start:=coalesce(new.starts_at,start_at);effective_end:=coalesce(new.ends_at,end_at);
  if effective_start<start_at or effective_end>end_at or effective_end<=effective_start then
   raise check_violation using message='Attendance interval must fit within the event';
  end if;
 end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at;else new.created_at:=clock_timestamp();end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger event_people_validate before insert or update on public.event_people for each row execute function public.map_validate_event_person();

create function public.map_validate_event() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then
  raise check_violation using message='Unknown event time zone';
 end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.source_id<>old.source_id or new.source_record_id<>old.source_record_id then
   raise check_violation using message='Event identity and source identity cannot change';
  end if;
  new.created_at:=old.created_at;
 else new.created_at:=clock_timestamp();end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger events_validate before insert or update on public.events for each row execute function public.map_validate_event();

-- Event timing changes must also satisfy existing participation boundaries.
create function public.map_check_event_people() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.event_people p where p.event_id=new.id and
  ((new.time_kind='unknown' and (p.starts_at is not null or p.ends_at is not null)) or
   (new.time_kind<>'unknown' and (
    coalesce(p.starts_at,case when new.time_kind='timed' then new.starts_at else new.starts_on::timestamp at time zone new.time_zone end)
     <case when new.time_kind='timed' then new.starts_at else new.starts_on::timestamp at time zone new.time_zone end
    or coalesce(p.ends_at,case when new.time_kind='timed' then new.ends_at else new.ends_on::timestamp at time zone new.time_zone end)
     >case when new.time_kind='timed' then new.ends_at else new.ends_on::timestamp at time zone new.time_zone end
    or coalesce(p.ends_at,case when new.time_kind='timed' then new.ends_at else new.ends_on::timestamp at time zone new.time_zone end)
     <=coalesce(p.starts_at,case when new.time_kind='timed' then new.starts_at else new.starts_on::timestamp at time zone new.time_zone end))))) then
  raise check_violation using message='Existing attendance would fall outside the event';
 end if;
 return new;
end $$;
create trigger events_people_check after update on public.events for each row execute function public.map_check_event_people();

-- Return all event/relationship objects, including expired/cancelled records for
-- reconciliation. p_at is validated, but the backend owns display time filtering.
-- Never expose identity-enrichment fields.
-- A saturated snapshot fails closed rather than returning partial map visibility.
create function public.map_read_events(p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_at is null or not isfinite(p_at) then raise check_violation using message='A finite observation time is required';end if;
 with eligible as materialized (select * from public.events ), eb as materialized (select b.* from public.event_buildings b join eligible e on e.id=b.event_id),
 ep as materialized (select p.* from public.event_people p join eligible e on e.id=p.event_id)
 select jsonb_build_object(
  'buildings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]') from public.map_buildings),
  'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'avatar_url',avatar_url,'is_trackable',is_trackable) order by id),'[]') from public.map_people),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from eligible e),
  'event_buildings',(select coalesce(jsonb_agg(to_jsonb(b) order by b.event_id,b.building_id),'[]') from eb b),
  'event_people',(select coalesce(jsonb_agg(to_jsonb(p) order by p.event_id,p.person_id),'[]') from ep p)) into result;
 if jsonb_array_length(result->'events')>2000 or jsonb_array_length(result->'event_buildings')>20000
  or jsonb_array_length(result->'event_people')>20000 or jsonb_array_length(result->'people')>500
  or jsonb_array_length(result->'buildings')>100 or octet_length(result::text)>16777216 then
  raise program_limit_exceeded using message='Event snapshot exceeds safe capacity';
 end if;
 return result;
end $$;

-- Full replacement with optimistic concurrency. Source identity cannot be reused
-- by a create retry; callers read the canonical record and retry with its timestamp.
create function public.map_upsert_event(p_event jsonb,p_buildings jsonb,p_people jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
<<event_write>>
declare event_id uuid;current_row public.events;entry jsonb;key text;new_updated_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
 if jsonb_typeof(p_event) is distinct from 'object' or jsonb_typeof(p_buildings) is distinct from 'array'
  or jsonb_typeof(p_people) is distinct from 'array' then raise check_violation using message='Event object and relationship arrays are required';end if;
 if jsonb_array_length(p_buildings)>100 or jsonb_array_length(p_people)>500 or octet_length(p_event::text)>65536 then
  raise program_limit_exceeded using message='Event write exceeds safe capacity';end if;
 if not(p_event ?& array['name','kind','time_kind','source_id','source_url','source_record_id','reported_at']) then
  raise check_violation using message='Missing event fields';end if;
 for key in select jsonb_object_keys(p_event) loop
  if not(key=any(array['id','name','notes','kind','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at']))
   or (jsonb_typeof(p_event->key)<>'string' and not(key=any(array['starts_at','ends_at','starts_on','ends_on','url']) and p_event->key='null'::jsonb)) then
   raise check_violation using message='Unknown or incorrectly typed event field';end if;
 end loop;
 event_id:=coalesce((p_event->>'id')::uuid,gen_random_uuid());
 select * into current_row from public.events where id=event_id for update;
 if p_expected_updated_at is null then
  if current_row.id is not null or exists(select 1 from public.events where source_id=(p_event->>'source_id')::uuid and source_record_id=p_event->>'source_record_id') then
   raise serialization_failure using message='Event create conflicts with an existing identity';end if;
 else
  if not isfinite(p_expected_updated_at) or current_row.id is null or current_row.updated_at<>p_expected_updated_at then
   raise serialization_failure using message='Event changed; read before retrying';end if;
  if current_row.source_id<>(p_event->>'source_id')::uuid or current_row.source_record_id<>p_event->>'source_record_id' then
   raise check_violation using message='Event source identity cannot change';end if;
 end if;
 -- Validate relationship shape before replacing anything. All failures roll back.
 for entry in select value from jsonb_array_elements(p_buildings) loop
  if jsonb_typeof(entry) is distinct from 'object' or not(entry ? 'building_id') then
   raise check_violation using message='Invalid event building';end if;
  for key in select jsonb_object_keys(entry) loop
   if not(key=any(array['building_id','location_notes'])) or jsonb_typeof(entry->key)<>'string' then
    raise check_violation using message='Unknown or incorrectly typed building field';end if;
  end loop;
 end loop;
 for entry in select value from jsonb_array_elements(p_people) loop
  if jsonb_typeof(entry) is distinct from 'object' or not(entry ?& array['person_id','presence_basis','source_id','source_url','reported_at']) then
   raise check_violation using message='Missing participation fields';end if;
  for key in select jsonb_object_keys(entry) loop
   if not(key=any(array['person_id','attendance_status','presence_basis','label','starts_at','ends_at','source_id','source_url','reported_at']))
    or (jsonb_typeof(entry->key)<>'string' and not(key=any(array['starts_at','ends_at']) and entry->key='null'::jsonb)) then
    raise check_violation using message='Unknown or incorrectly typed participation field';end if;
  end loop;
 end loop;
 if current_row.id is not null then
  delete from public.event_people where public.event_people.event_id=event_write.event_id;
  delete from public.event_buildings where public.event_buildings.event_id=event_write.event_id;
  update public.events set name=p_event->>'name',notes=coalesce(p_event->>'notes',''),kind=p_event->>'kind',status=coalesce(p_event->>'status','confirmed'),
   time_kind=p_event->>'time_kind',starts_at=(p_event->>'starts_at')::timestamptz,ends_at=(p_event->>'ends_at')::timestamptz,
   starts_on=(p_event->>'starts_on')::date,ends_on=(p_event->>'ends_on')::date,time_zone=coalesce(p_event->>'time_zone','America/New_York'),
   source_url=p_event->>'source_url',url=p_event->>'url',reported_at=(p_event->>'reported_at')::timestamptz
   where id=event_id returning updated_at into new_updated_at;
 else
  insert into public.events(id,name,notes,kind,status,time_kind,starts_at,ends_at,starts_on,ends_on,time_zone,source_id,source_url,source_record_id,url,reported_at)
  values(event_id,p_event->>'name',coalesce(p_event->>'notes',''),p_event->>'kind',coalesce(p_event->>'status','confirmed'),p_event->>'time_kind',
   (p_event->>'starts_at')::timestamptz,(p_event->>'ends_at')::timestamptz,(p_event->>'starts_on')::date,(p_event->>'ends_on')::date,
   coalesce(p_event->>'time_zone','America/New_York'),(p_event->>'source_id')::uuid,p_event->>'source_url',p_event->>'source_record_id',p_event->>'url',
   (p_event->>'reported_at')::timestamptz) returning updated_at into new_updated_at;
 end if;
 insert into public.event_buildings(event_id,building_id,location_notes)
 select event_id,e->>'building_id',coalesce(e->>'location_notes','') from jsonb_array_elements(p_buildings) e;
 insert into public.event_people(event_id,person_id,attendance_status,presence_basis,label,starts_at,ends_at,source_id,source_url,reported_at)
 select event_id,(e->>'person_id')::uuid,coalesce(e->>'attendance_status','going'),e->>'presence_basis',coalesce(e->>'label',''),
  (e->>'starts_at')::timestamptz,(e->>'ends_at')::timestamptz,(e->>'source_id')::uuid,e->>'source_url',(e->>'reported_at')::timestamptz
 from jsonb_array_elements(p_people) e;
 return jsonb_build_object('status','applied','event_id',event_id,'updated_at',new_updated_at);
end $$;

-- Pure deterministic conversion retained only until the equivalence-gated cutover.
-- report timestamps did not exist in legacy JSON: original valid_from/starts_at
-- is the conservative proxy. No expiry is recomputed from migration time.
create function public.map_legacy_event_rows()
returns table(event_data jsonb,building_data jsonb,people_data jsonb)
language sql stable security invoker set search_path='' as $$
 with presence as (
  select b.id building_id,e.value v,
   'legacy-presence:'||md5(b.id||':'||(e.value->>'person_id')::uuid::text||':'||extract(epoch from (e.value->>'valid_from')::timestamptz)::text) record_id
  from public.map_buildings b cross join lateral jsonb_array_elements(b.people_here) e
 ), scheduled as (
  select b.id building_id,e.value v from public.map_buildings b cross join lateral jsonb_array_elements(b.scheduled_events) e
 ), source_rows as (
  select md5('tech-nyu-events-v1:'||(v->>'source_id')::uuid::text||':'||record_id)::uuid id,
   building_id,v,record_id,false scheduled from presence
  union all
  select md5('tech-nyu-events-v1:'||(v->>'source_id')::uuid::text||':'||(v->>'id'))::uuid,
   building_id,v,v->>'id',true from scheduled
 )
 select jsonb_build_object('id',id,
  'name',case when scheduled then v->>'title' else case when btrim(v->>'label')<>'' then v->>'label' else 'Presence' end end,
  'notes',case when scheduled then coalesce(v->>'description','') else '' end,
  'kind',case when scheduled then 'scheduled_event' when v->>'status'='planned' then 'personal_plan' else 'presence' end,
  'status',case when scheduled then v->>'status' else 'confirmed' end,
  'time_kind',case when scheduled and (v->>'all_day')::boolean then 'all_day' else 'timed' end,
  'starts_at',case when scheduled and (v->>'all_day')::boolean then null else (v->>case when scheduled then 'starts_at' else 'valid_from' end)::timestamptz end,
  'ends_at',case when scheduled and (v->>'all_day')::boolean then null else (v->>case when scheduled then 'ends_at' else 'expires_at' end)::timestamptz end,
  'starts_on',case when scheduled and (v->>'all_day')::boolean then ((v->>'starts_at')::timestamptz at time zone (v->>'time_zone'))::date else null end,
  'ends_on',case when scheduled and (v->>'all_day')::boolean then ((v->>'ends_at')::timestamptz at time zone (v->>'time_zone'))::date else null end,
  'time_zone',case when scheduled then v->>'time_zone' else 'America/New_York' end,
  'source_id',(v->>'source_id')::uuid,'source_url',v->>'source_url','source_record_id',record_id,
  'url',case when scheduled then nullif(v->>'url','') else null end,
  'reported_at',(v->>case when scheduled then 'starts_at' else 'valid_from' end)::timestamptz),
 jsonb_build_object('event_id',id,'building_id',building_id,'location_notes',case when scheduled then coalesce(v->>'location','') else '' end),
 case when scheduled then (
  select coalesce(jsonb_agg(jsonb_build_object('event_id',id,'person_id',attendee::uuid,'attendance_status','going','presence_basis','planned',
   'label','','starts_at',null,'ends_at',null,'source_id',(v->>'source_id')::uuid,'source_url',v->>'source_url','reported_at',(v->>'starts_at')::timestamptz)
   order by attendee::uuid),'[]') from jsonb_array_elements_text(coalesce(v->'attendee_ids','[]'::jsonb)) a(attendee)
 ) else jsonb_build_array(jsonb_build_object('event_id',id,'person_id',(v->>'person_id')::uuid,'attendance_status','going',
  'presence_basis',case when v->>'status'='planned' then 'planned' else 'reported' end,'label',v->>'label',
  'starts_at',null,'ends_at',null,'source_id',(v->>'source_id')::uuid,'source_url',v->>'source_url','reported_at',(v->>'valid_from')::timestamptz)) end
 from source_rows
$$;

-- Refuse lossy merges, including attendee discrepancies across copied events.
-- Legacy all-day timestamps must represent midnight in their declared timezone.
-- If not, an owner must correct that ambiguity before migration, never guess.
do $$
begin
 if exists(select 1 from public.map_legacy_event_rows() group by event_data->>'id'
  having count(distinct event_data)>1 or count(distinct people_data)>1) then
  raise check_violation using message='Conflicting legacy event copies; reconcile before migration';end if;
 if exists(select 1 from public.map_buildings b cross join lateral jsonb_array_elements(b.scheduled_events) e
  where (e->>'all_day')::boolean and (
   ((e->>'starts_at')::timestamptz at time zone (e->>'time_zone'))::time<>'00:00:00'::time
   or ((e->>'ends_at')::timestamptz at time zone (e->>'time_zone'))::time<>'00:00:00'::time)) then
  raise check_violation using message='Legacy all-day event has non-midnight boundaries';end if;
end $$;

insert into public.events(id,name,notes,kind,status,time_kind,starts_at,ends_at,starts_on,ends_on,time_zone,source_id,source_url,source_record_id,url,reported_at)
select distinct r.* from public.map_legacy_event_rows() l cross join lateral jsonb_to_record(l.event_data)
 as r(id uuid,name text,notes text,kind text,status text,time_kind text,starts_at timestamptz,ends_at timestamptz,starts_on date,ends_on date,time_zone text,source_id uuid,source_url text,source_record_id text,url text,reported_at timestamptz);
insert into public.event_buildings(event_id,building_id,location_notes)
select distinct r.* from public.map_legacy_event_rows() l cross join lateral jsonb_to_record(l.building_data) as r(event_id uuid,building_id text,location_notes text);
insert into public.event_people(event_id,person_id,attendance_status,presence_basis,label,starts_at,ends_at,source_id,source_url,reported_at)
select distinct r.* from public.map_legacy_event_rows() l cross join lateral jsonb_array_elements(l.people_data) p
 cross join lateral jsonb_to_record(p) as r(event_id uuid,person_id uuid,attendance_status text,presence_basis text,label text,starts_at timestamptz,ends_at timestamptz,source_id uuid,source_url text,reported_at timestamptz);

-- Stage 026 guards both representations while the old columns still exist.
create or replace function public.map_guard_person() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then raise check_violation using message='Person identity cannot change';end if;
 if tg_op='DELETE' or (tg_op='UPDATE' and not new.is_trackable) then
  if exists(select 1 from public.event_people where person_id=old.id)
   or exists(select 1 from public.map_buildings b cross join lateral jsonb_array_elements(b.people_here) e where (e->>'person_id')::uuid=old.id) then
   raise foreign_key_violation using message='Remove event participation before deleting or disabling a person';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;

alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.event_buildings enable row level security;
alter table public.event_buildings force row level security;
alter table public.event_people enable row level security;
alter table public.event_people force row level security;
revoke all on table public.events,public.event_buildings,public.event_people from public,anon,authenticated,service_role;
grant select on table public.events,public.event_buildings,public.event_people to service_role;
revoke all on function public.map_event_lock(),public.map_validate_event(),public.map_validate_event_person(),public.map_check_event_people(),public.map_legacy_event_rows(),
 public.map_read_events(timestamptz),public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;
alter function public.map_read_events(timestamptz) owner to postgres;
alter function public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) owner to postgres;
grant execute on function public.map_read_events(timestamptz),public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) to service_role;
comment on table public.events is 'Source-backed map activities. Source UUIDs confer no access; backend checks current source policy before every read/write. No knowledge_sources FK: Discord sources live in discord_view_policies.';
comment on table public.event_buildings is 'Every participant may be visible at every linked building. Multiple simultaneous locations are intentional; no primary location.';
comment on table public.event_people is 'Participant provenance is independent from event provenance; effective timing inherits missing event boundaries. Source policy and trackability gate display.';
notify pgrst,'reload schema';
commit;
