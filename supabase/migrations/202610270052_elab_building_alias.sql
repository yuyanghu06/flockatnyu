-- Owner-applied fixed catalogue correction. Runtime catalogue writes stay denied.
-- Preserve the building's timestamp: this changes its recognized name only,
-- not activity data, and must not look like a new map activity update.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
lock table public.map_buildings in access exclusive mode;

do $$
begin
 if not exists (
  select 1 from public.map_buildings
  where id='nyu-leslie-elab-building' and name='Leslie eLab building'
   and 'Leslie eLab'=any(aliases)
 ) then
  raise check_violation using message='eLab alias target does not match the fixed building';
 end if;
 if not exists (
  select 1 from pg_catalog.pg_trigger
  where tgrelid='public.map_buildings'::regclass
   and tgname='map_buildings_validate' and not tgisinternal and tgenabled='O'
 ) then
  raise check_violation using message='Expected enabled building validation trigger';
 end if;
 if exists (
  select 1 from public.map_buildings
  where id='nyu-leslie-elab-building' and not ('eLab'=any(aliases))
   and cardinality(aliases)>=30
 ) then
  raise check_violation using message='No room for the additional eLab alias';
 end if;
end $$;

-- The exclusive lock prevents other writes while this timestamp-setting trigger
-- is suspended; transactional DDL restores its state if any statement fails.
alter table public.map_buildings disable trigger map_buildings_validate;
update public.map_buildings
set aliases=array_append(aliases,'eLab')
where id='nyu-leslie-elab-building' and not ('eLab'=any(aliases));
alter table public.map_buildings enable trigger map_buildings_validate;
commit;
