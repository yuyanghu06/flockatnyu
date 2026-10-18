-- Presence display labels are explicit table values, independent of provenance.
-- Keep the fixed catalogue, source checks, write lock and existing runtime ACLs.
begin;

create or replace function public.map_validate_building() returns trigger
language plpgsql security invoker set search_path='' as $$
declare entry jsonb;person uuid;seen uuid[]:='{}';start_at timestamptz;end_at timestamptz;alias text;
begin
 if jsonb_typeof(new.people_here) is distinct from 'array' or jsonb_array_length(new.people_here)>500 then
  raise check_violation using message='people_here must be an array of at most 500 entries';
 end if;
 if cardinality(new.aliases)>30 or array_ndims(new.aliases)>1 then
  raise check_violation using message='At most 30 one-dimensional aliases are allowed';
 end if;
 foreach alias in array new.aliases loop
  if alias is null or alias<>btrim(alias) or length(alias) not between 1 and 200 then
   raise check_violation using message='Invalid building alias';
  end if;
 end loop;
 for entry in select value from jsonb_array_elements(new.people_here) loop
  if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& array['person_id','status','valid_from','expires_at','source_id','source_url','label'])
   or (select count(*) from jsonb_object_keys(entry))<>7 then
   raise check_violation using message='Invalid presence entry fields';
  end if;
  if exists(select 1 from jsonb_each(entry) e where jsonb_typeof(e.value)<>'string') then
   raise check_violation using message='Presence fields must be strings';
  end if;
  if entry->>'person_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or entry->>'source_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or entry->>'status' not in ('self_reported','planned')
   or char_length(entry->>'label')>200
   or length(entry->>'source_url') not between 9 and 2048
   or entry->>'source_url' !~ '^https://[^/?#[:space:][:cntrl:]]+(/[^[:space:][:cntrl:]]*)?$'
   or length(entry->>'valid_from')>40 or length(entry->>'expires_at')>40
   or entry->>'valid_from' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
   or entry->>'expires_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
   raise check_violation using message='Invalid presence value';
  end if;
  person:=(entry->>'person_id')::uuid;
  start_at:=(entry->>'valid_from')::timestamptz;
  end_at:=(entry->>'expires_at')::timestamptz;
  if not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at then
   raise check_violation using message='Presence expiry must follow its start';
  end if;
  if person=any(seen) then raise check_violation using message='Duplicate person in building';end if;
  seen:=array_append(seen,person);
  if not exists(select 1 from public.map_people p where p.id=person and p.is_trackable) then
   raise foreign_key_violation using message='Presence requires an existing trackable person';
  end if;
 end loop;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
-- Upgrade only legacy entries that lack a label. Keep array order, existing
-- labels and every prior field; a blank label adds no inferred display text.
update public.map_buildings b set people_here=(
 select jsonb_agg(case when e.value ? 'label' then e.value
  else e.value || jsonb_build_object('label','') end order by e.ordinality)
 from jsonb_array_elements(b.people_here) with ordinality e(value,ordinality)
)
where exists(select 1 from jsonb_array_elements(b.people_here) e
 where not (e.value ? 'label'));

comment on column public.map_buildings.people_here is 'Unique person per building: person_id, status (self_reported/planned), finite valid_from/expires_at, source_id, HTTPS source_url and label (0–200 Unicode code points, preserved verbatim for display). Reads must exclude expired/future entries and enforce source policy.';

notify pgrst,'reload schema';
commit;
