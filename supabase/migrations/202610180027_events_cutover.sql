-- Apply only after the application is ready for map_read_events/map_upsert_event.
-- All destructive steps are gated by complete deterministic legacy equivalence.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
lock table public.map_buildings,public.map_people,public.events,public.event_buildings,public.event_people in share row exclusive mode;

do $$
declare expected_events bigint;expected_buildings bigint;expected_people bigint;
begin
 if exists(select 1 from public.map_legacy_event_rows() group by event_data->>'id'
  having count(distinct event_data)>1 or count(distinct people_data)>1) then
  raise check_violation using message='Conflicting legacy events prevent cutover';end if;
 -- Compare both directions within the migrated subset: omissions, edits and
 -- accidental added relationships all abort. Unrelated new events may coexist.
 if exists(
  (select distinct event_data from public.map_legacy_event_rows()
   except select to_jsonb(e)-'created_at'-'updated_at' from public.events e)
  union all
  (select to_jsonb(e)-'created_at'-'updated_at' from public.events e where e.id in(select (event_data->>'id')::uuid from public.map_legacy_event_rows())
   except select distinct event_data from public.map_legacy_event_rows())
 ) then raise check_violation using message='Legacy events are not exactly preserved; cutover aborted';end if;
 if exists(
  (select distinct building_data from public.map_legacy_event_rows()
   except select to_jsonb(b) from public.event_buildings b)
  union all
  (select to_jsonb(b) from public.event_buildings b where b.event_id in(select (event_data->>'id')::uuid from public.map_legacy_event_rows())
   except select distinct building_data from public.map_legacy_event_rows())
 ) then raise check_violation using message='Legacy event buildings are not exactly preserved; cutover aborted';end if;
 if exists(
  (select distinct p from public.map_legacy_event_rows() l cross join lateral jsonb_array_elements(l.people_data) p
   except select to_jsonb(p)-'created_at'-'updated_at' from public.event_people p)
  union all
  (select to_jsonb(p)-'created_at'-'updated_at' from public.event_people p where p.event_id in(select (event_data->>'id')::uuid from public.map_legacy_event_rows())
   except select distinct p from public.map_legacy_event_rows() l cross join lateral jsonb_array_elements(l.people_data) p)
 ) then raise check_violation using message='Legacy event people are not exactly preserved; cutover aborted';end if;
 -- A legacy deletion must not leave an old converted activity behind. Prefix and
 -- deterministic namespace distinguish these records from unrelated new events.
 if exists(select 1 from public.events e where (e.source_record_id like 'legacy-presence:%'
  or e.id=md5('tech-nyu-events-v1:'||e.source_id::text||':'||e.source_record_id)::uuid)
  and not exists(select 1 from public.map_legacy_event_rows() l where (l.event_data->>'id')::uuid=e.id)) then
  raise check_violation using message='Orphan migrated event prevents cutover';end if;
 select count(distinct event_data),count(distinct building_data),
  (select count(distinct p) from public.map_legacy_event_rows() l cross join lateral jsonb_array_elements(l.people_data) p)
 into expected_events,expected_buildings,expected_people from public.map_legacy_event_rows();
 raise notice 'Event cutover verified: % events, % building relationships, % participant relationships',expected_events,expected_buildings,expected_people;
end $$;

-- Runtime can no longer mutate the fixed location catalogue.
revoke insert,update,delete on table public.map_buildings from service_role;
revoke update(id,name,aliases,people_here,scheduled_events,updated_at) on table public.map_buildings from service_role;

drop function public.map_set_person_location(uuid,text,jsonb);
drop function public.map_get_buildings(timestamptz);
drop trigger map_buildings_scheduled_events_validate on public.map_buildings;
drop function public.map_validate_scheduled_events();
drop function public.map_legacy_event_rows();

-- Preserve catalogue alias and database-managed timestamp validation.
create or replace function public.map_validate_building() returns trigger
language plpgsql security invoker set search_path='' as $$
declare alias text;
begin
 if cardinality(new.aliases)>30 or array_ndims(new.aliases)>1 then
  raise check_violation using message='At most 30 one-dimensional aliases are allowed';end if;
 foreach alias in array new.aliases loop
  if alias is null or alias<>btrim(alias) or length(alias) not between 1 and 200 then
   raise check_violation using message='Invalid building alias';end if;
 end loop;
 new.updated_at:=clock_timestamp();return new;
end $$;
create or replace function public.map_guard_person() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then raise check_violation using message='Person identity cannot change';end if;
 if tg_op='DELETE' or (tg_op='UPDATE' and not new.is_trackable) then
  if exists(select 1 from public.event_people where person_id=old.id) then
   raise foreign_key_violation using message='Remove event participation before deleting or disabling a person';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;

alter table public.map_buildings drop column people_here;
alter table public.map_buildings drop column scheduled_events;
comment on table public.map_buildings is 'Fixed selectable location catalogue. Map activity belongs to events/event_buildings/event_people; runtime catalogue writes denied.';
notify pgrst,'reload schema';
commit;
