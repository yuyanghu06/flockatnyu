-- Fixed catalogue aliases are visible only to the trusted deterministic matcher.
-- No catalogue writes or browser/member grants are introduced.
begin;
create function public.map_read_building_aliases() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'aliases',aliases) order by id),'[]'::jsonb)
 from public.map_buildings;
$$;
alter function public.map_read_building_aliases() owner to postgres;
revoke all on function public.map_read_building_aliases() from public,anon,authenticated;
grant execute on function public.map_read_building_aliases() to service_role;
comment on function public.map_read_building_aliases() is 'Service-only fixed building names and aliases for deterministic Calendar projection; catalogue remains immutable to runtime.';
commit;
