begin;
-- Deterministic projection and agent follow-up share the same active queue run.
-- Locking the runner fences the actual map transaction against expired workers.
create function public.map_automation_upsert_event(p_token uuid,p_event jsonb,p_buildings jsonb,p_people jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb;
begin
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text
   or coalesce((runner->>'lease_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() then
  return jsonb_build_object('status','conflict');
 end if;
 return public.map_upsert_event(p_event,p_buildings,p_people,p_expected_updated_at);
end;
$$;
revoke all on function public.map_automation_upsert_event(uuid,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.map_automation_upsert_event(uuid,jsonb,jsonb,jsonb,timestamptz) to service_role;
commit;
