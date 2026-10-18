-- Optional attendee person IDs inside existing event JSON. No table or access changes.
begin;

create or replace function public.map_validate_scheduled_events() returns trigger
language plpgsql security invoker set search_path='' as $$
declare event jsonb;seen text[]:='{}';starts timestamptz;ends timestamptz;field text;attendee jsonb;attendee_ids uuid[];attendee_id uuid;
begin
 if jsonb_typeof(new.scheduled_events) is distinct from 'array' or jsonb_array_length(new.scheduled_events)>200 then
  raise check_violation using message='scheduled_events must be an array of at most 200 flattened events';
 end if;
 for event in select value from jsonb_array_elements(new.scheduled_events) loop
  if jsonb_typeof(event) is distinct from 'object' or not(event ?& array['id','title','starts_at','ends_at','time_zone','all_day','status','source_id','source_url']) then
   raise check_violation using message='Missing scheduled event fields';
  end if;
  for field in select jsonb_object_keys(event) loop
   if not(field=any(array['id','title','starts_at','ends_at','time_zone','all_day','status','source_id','source_url','description','location','url','attendee_ids']))
    or (field='all_day' and jsonb_typeof(event->field)<>'boolean')
    or (field='attendee_ids' and jsonb_typeof(event->field)<>'array')
    or (field not in ('all_day','attendee_ids') and jsonb_typeof(event->field)<>'string') then
    raise check_violation using message='Scheduled event fields must be flat and correctly typed';
   end if;
  end loop;
  if length(event->>'id') not between 1 and 200 or length(btrim(event->>'title')) not between 1 and 200
   or event->>'status' not in ('confirmed','tentative','cancelled')
   or length(event->>'starts_at')>40 or length(event->>'ends_at')>40
   or event->>'starts_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
   or event->>'ends_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
   or not exists(select 1 from pg_catalog.pg_timezone_names where name=event->>'time_zone')
   or event->>'source_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or length(event->>'source_url') not between 9 and 2048
   or event->>'source_url' !~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'
   or length(coalesce(event->>'description',''))>4000 or length(coalesce(event->>'location',''))>500
   or length(coalesce(event->>'url',''))>2048
   or (coalesce(event->>'url','')<>'' and event->>'url' !~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$') then
   raise check_violation using message='Invalid scheduled event value';
  end if;
  if event ? 'attendee_ids' then
   if jsonb_typeof(event->'attendee_ids') is distinct from 'array' or jsonb_array_length(event->'attendee_ids')>500 then
    raise check_violation using message='Event attendee_ids must be an array of at most 500 person UUIDs';
   end if;
   attendee_ids:='{}';
   for attendee in select value from jsonb_array_elements(event->'attendee_ids') loop
    if jsonb_typeof(attendee)<>'string' or attendee#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
     raise check_violation using message='Event attendee_ids must contain person UUID strings';
    end if;
    attendee_id:=(attendee#>>'{}')::uuid;
    if attendee_id=any(attendee_ids) then raise check_violation using message='Duplicate event attendee';end if;
    if not exists(select 1 from public.map_people where id=attendee_id) then raise foreign_key_violation using message='Unknown event attendee';end if;
    attendee_ids:=array_append(attendee_ids,attendee_id);
   end loop;
  end if;
  starts:=(event->>'starts_at')::timestamptz;ends:=(event->>'ends_at')::timestamptz;
  if not isfinite(starts) or not isfinite(ends) or ends<=starts then
   raise check_violation using message='Scheduled event end must follow start';
  end if;
  if event->>'id'=any(seen) then raise check_violation using message='Duplicate scheduled event identity in building';end if;
  seen:=array_append(seen,event->>'id');
 end loop;
 return new;
end $$;

comment on column public.map_buildings.scheduled_events is 'Bounded event JSON with optional attendee_ids array of unique map_people UUIDs; legacy events may omit attendees. Owner-only event writes; source policy gates reads.';
notify pgrst,'reload schema';
commit;
