-- Saved-task selection metadata and exact reads. Neither operation prunes work,
-- reads a source service, or locks the runner while serializing task histories.
begin;

create function public.agent_pending_task_catalogue(p_token uuid,p_allowed_source_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb; catalogue jsonb;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) then
  return jsonb_build_object('status','invalid_request');
 end if;
 if cardinality(p_allowed_source_ids)=0 then
  return jsonb_build_object('status','ready','tasks','[]'::jsonb);
 end if;
 select data into runner from public.agent_automation_state where key='runner';
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;

 with projected as materialized (
  select t.uuid,t.created_at,t.updated_at,t.expires_at,
   t.info->'sourceIds' as sources,t.info->'request' as request,
   case when jsonb_typeof(t.info->'inputs')='array' then t.info->'inputs' else '[]'::jsonb end as inputs,
   t.info->>'version'='1' as version_valid
  from public.agent_pending_tasks t
  where t.expires_at>clock_timestamp()
   and public.agent_pending_task_sources(t.info)<@p_allowed_source_ids
 ), entries as (
  select p.uuid,p.created_at,p.updated_at,p.expires_at,
   jsonb_build_object(
    'uuid',p.uuid,'created_at',p.created_at,'updated_at',p.updated_at,'expires_at',p.expires_at,
    'sourceIds',p.sources,
    'inputIds',coalesce((select jsonb_agg(ids.id order by ids.position) from (
     select lower(i.value->>'uuid') as id,min(i.ordinality) as position
     from jsonb_array_elements(p.inputs) with ordinality i(value,ordinality)
     where jsonb_typeof(i.value->'uuid')='string'
      and i.value->>'uuid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     group by lower(i.value->>'uuid')
    ) ids),'[]'::jsonb),
    'modelEligible',coalesce(p.version_valid
     and p.request->>'operation' in ('participation','location','source_review')
     and jsonb_array_length(p.inputs)>0
     and not exists(select 1 from jsonb_array_elements(p.inputs) i where
      jsonb_typeof(i) is distinct from 'object'
      or jsonb_typeof(i->'uuid') is distinct from 'string'
      or not coalesce(i->>'uuid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
      or jsonb_typeof(i->'raw_response') is distinct from 'object'
      or not coalesce(i->'raw_response'->>'source' in ('discord','gmail'),false)
      or not coalesce(p.sources ? (i->'raw_response'->>'source_id'),false)
      or jsonb_typeof(i->'raw_response'->'payload') is distinct from 'object')
     and jsonb_array_length(p.inputs)=(select count(distinct lower(i->>'uuid')) from jsonb_array_elements(p.inputs)i),false),
    'summaryTruncated',case when jsonb_typeof(p.request->'summary')='string' then char_length(p.request->>'summary')>100 else false end,
    'request',jsonb_strip_nulls(jsonb_build_object(
     'summary',case when jsonb_typeof(p.request->'summary')='string' then left(p.request->>'summary',100) else 'Deferred source work' end,
     'operation',case when jsonb_typeof(p.request->'operation')='string' then p.request->>'operation' end,
     'calendarKind',case when jsonb_typeof(p.request->'calendarKind')='string' then p.request->>'calendarKind' end,
     'calendarEventId',case when jsonb_typeof(p.request->'calendarEventId')='string' and char_length(p.request->>'calendarEventId')<=1024 then p.request->>'calendarEventId' end,
     'personId',case when jsonb_typeof(p.request->'personId')='string' then p.request->>'personId' end,
     'buildingId',case when jsonb_typeof(p.request->'buildingId')='string' then p.request->>'buildingId' end
    ))) as entry
  from projected p
 ) select coalesce(jsonb_agg(e.entry order by e.created_at,e.uuid),'[]'::jsonb) into catalogue from entries e;
 return jsonb_build_object('status','ready','tasks',catalogue);
end $$;

create function public.agent_pending_task_read(p_token uuid,p_allowed_source_ids uuid[],p_task_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb; task public.agent_pending_tasks;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) or p_task_id is null then
  return jsonb_build_object('status','invalid_request');
 end if;
 if cardinality(p_allowed_source_ids)=0 then return jsonb_build_object('status','not_found');end if;
 select data into runner from public.agent_automation_state where key='runner';
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 select t.* into task from public.agent_pending_tasks t
  where t.uuid=p_task_id and t.expires_at>clock_timestamp()
   and public.agent_pending_task_sources(t.info)<@p_allowed_source_ids;
 if not found then return jsonb_build_object('status','not_found');end if;
 return jsonb_build_object('status','ready','task',to_jsonb(task));
end $$;

revoke all on function public.agent_pending_task_catalogue(uuid,uuid[]),
 public.agent_pending_task_read(uuid,uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.agent_pending_task_catalogue(uuid,uuid[]),
 public.agent_pending_task_read(uuid,uuid[],uuid) to service_role;
comment on function public.agent_pending_task_catalogue(uuid,uuid[]) is
 'Service-only scoped saved-task metadata. No originals/history, source calls, pruning or runner write lock. Selection never authorizes task completion.';
comment on function public.agent_pending_task_read(uuid,uuid[],uuid) is
 'Service-only exact complete saved-task read with current lease, source scope and expiry checks. No pruning or cross-service retrieval.';
notify pgrst,'reload schema';
commit;
