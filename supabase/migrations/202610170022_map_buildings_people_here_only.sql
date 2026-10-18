-- Map locations are a fixed catalogue. Application services may change only
-- people_here; catalogue changes require a separately reviewed owner migration.
begin;

revoke insert, update, delete on table public.map_buildings from service_role;
-- Remove any explicit column UPDATE grants as well as the table-wide grant.
revoke update (id, name, aliases, people_here, updated_at)
 on table public.map_buildings from service_role;
grant update (people_here) on table public.map_buildings to service_role;

-- Existing SELECT/EXECUTE grants and forced RLS remain unchanged. The invoker
-- presence RPC can still lock rows and update people_here. updated_at remains
-- server-managed by the existing validation trigger, never a writable input.
notify pgrst, 'reload schema';
commit;
