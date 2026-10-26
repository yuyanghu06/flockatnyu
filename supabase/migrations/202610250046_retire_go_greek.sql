-- Owner-requested retirement of the temporary Go Greek popup and its attached
-- Flock activities. Keep source originals, people and shared events intact.
-- The historical 037 seed remains immutable; runtime catalogue grants do not change.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));

do $$
declare target public.map_buildings;
begin
 select * into target from public.map_buildings where id='683-broadway' for update;
 if not found then return; end if;
 if target.name is distinct from 'Go Greek'
  or target.aliases is distinct from array['683 Broadway']::text[] then
  raise check_violation using message='Go Greek retirement conflicts with existing building identity';
 end if;

 -- Only activities whose sole building is this retired popup are removed.
 -- Existing event FKs cascade their building and attendance relationships.
 delete from public.events e
 where exists(select 1 from public.event_buildings b
              where b.event_id=e.id and b.building_id=target.id)
   and not exists(select 1 from public.event_buildings b
                  where b.event_id=e.id and b.building_id<>target.id);

 -- Activities also used at other buildings retain all event and attendee data.
 delete from public.event_buildings where building_id=target.id;
 delete from public.map_buildings where id=target.id;
end $$;
commit;
