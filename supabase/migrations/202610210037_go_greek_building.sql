-- Owner-applied fixed catalogue seed only. Runtime/agent catalogue writes remain
-- denied. This migration is independent of pending automation migration036.
begin;
select pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));

insert into public.map_buildings(id,name,aliases)
values ('683-broadway','Go Greek',array['683 Broadway']::text[])
on conflict (id) do nothing;

-- Replays preserve existing timestamps. A conflicting human-managed row must
-- stop the release instead of being overwritten or accepted as the popup.
do $$
begin
 if not exists (
  select 1 from public.map_buildings
  where id='683-broadway' and name='Go Greek'
   and aliases=array['683 Broadway']::text[]
 ) then
  raise check_violation using message='Go Greek catalogue seed conflicts with existing building identity';
 end if;
end $$;
commit;
