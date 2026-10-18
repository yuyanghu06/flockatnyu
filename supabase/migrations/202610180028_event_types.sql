-- Fixed event classification catalogue. Types are independent from activity kind:
-- agents may choose a listed type, but may not edit the catalogue or its icons.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));

create table public.event_types (
 code text primary key check (code in ('study','meeting','event','social','other')),
 name text not null check (name=btrim(name) and length(name) between 1 and 100),
 description text not null default '' check (length(description)<=500),
 icon_key text not null unique check (icon_key in ('study','meeting','event','social','other')),
 sort_order integer not null check (sort_order between 0 and 1000)
);
insert into public.event_types(code,name,description,icon_key,sort_order) values
 ('study','Study','Studying individually or together.','study',10),
 ('meeting','Meeting','Meetings and planning discussions.','meeting',20),
 ('event','Event','Organized activities.','event',30),
 ('social','Social','Social gatherings.','social',40),
 ('other','Other','Unknown or unclassified activities.','other',50);

-- Adding a defaulted column preserves all existing event values and timestamps;
-- do not UPDATE existing rows or fire their timestamp-maintenance triggers.
alter table public.events add column type_id text not null default 'other'
 references public.event_types(code) on delete restrict;

alter table public.event_types enable row level security;
alter table public.event_types force row level security;
revoke all on table public.event_types from public,anon,authenticated,service_role;
grant select on table public.event_types to service_role;
comment on table public.event_types is 'Fixed activity classification and safe bundled icon keys. Service-role SELECT only; no catalogue write tool or RPC.';
comment on column public.events.type_id is 'Classification independent of presence/personal_plan/scheduled_event kind. Existing events default to other; no inference from attendance.';

create or replace function public.map_read_events(p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_at is null or not isfinite(p_at) then raise check_violation using message='A finite observation time is required';end if;
 with eligible as materialized (select * from public.events ), eb as materialized (select b.* from public.event_buildings b join eligible e on e.id=b.event_id),
 ep as materialized (select p.* from public.event_people p join eligible e on e.id=p.event_id)
 select jsonb_build_object(
  'event_types',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'description',description,'icon_key',icon_key,'sort_order',sort_order) order by sort_order,code),'[]') from public.event_types),
  'buildings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]') from public.map_buildings),
  'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'avatar_url',avatar_url,'is_trackable',is_trackable) order by id),'[]') from public.map_people),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from eligible e),
  'event_buildings',(select coalesce(jsonb_agg(to_jsonb(b) order by b.event_id,b.building_id),'[]') from eb b),
  'event_people',(select coalesce(jsonb_agg(to_jsonb(p) order by p.event_id,p.person_id),'[]') from ep p)) into result;
 if jsonb_array_length(result->'event_types')>100 or jsonb_array_length(result->'events')>2000 or jsonb_array_length(result->'event_buildings')>20000
  or jsonb_array_length(result->'event_people')>20000 or jsonb_array_length(result->'people')>500
  or jsonb_array_length(result->'buildings')>100 or octet_length(result::text)>16777216 then
  raise program_limit_exceeded using message='Event snapshot exceeds safe capacity';
 end if;
 return result;
end $$;

-- Preserve optimistic concurrency, source identity and atomic relationship replacement.
-- Omitted type on update keeps the existing classification; new events use other.
create or replace function public.map_upsert_event(p_event jsonb,p_buildings jsonb,p_people jsonb,p_expected_updated_at timestamptz default null)
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
  if not(key=any(array['id','name','notes','kind','type_id','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at']))
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
  update public.events set type_id=coalesce(p_event->>'type_id',current_row.type_id),name=p_event->>'name',notes=coalesce(p_event->>'notes',''),kind=p_event->>'kind',status=coalesce(p_event->>'status','confirmed'),
   time_kind=p_event->>'time_kind',starts_at=(p_event->>'starts_at')::timestamptz,ends_at=(p_event->>'ends_at')::timestamptz,
   starts_on=(p_event->>'starts_on')::date,ends_on=(p_event->>'ends_on')::date,time_zone=coalesce(p_event->>'time_zone','America/New_York'),
   source_url=p_event->>'source_url',url=p_event->>'url',reported_at=(p_event->>'reported_at')::timestamptz
   where id=event_id returning updated_at into new_updated_at;
 else
  insert into public.events(id,type_id,name,notes,kind,status,time_kind,starts_at,ends_at,starts_on,ends_on,time_zone,source_id,source_url,source_record_id,url,reported_at)
  values(event_id,coalesce(p_event->>'type_id','other'),p_event->>'name',coalesce(p_event->>'notes',''),p_event->>'kind',coalesce(p_event->>'status','confirmed'),p_event->>'time_kind',
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

-- CREATE OR REPLACE preserves ACLs; repeat the exact approved service-only
-- boundary explicitly. Both replacements retain their existing signatures.
alter function public.map_read_events(timestamptz) owner to postgres;
alter function public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) owner to postgres;
revoke all on function public.map_read_events(timestamptz),public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.map_read_events(timestamptz),public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
