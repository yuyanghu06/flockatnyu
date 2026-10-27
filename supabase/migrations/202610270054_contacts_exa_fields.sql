-- Read explicit supported Exa person fields without rewriting provider JSON,
-- saved contacts, cache inputs or timestamps. Existing manual fields still win.
begin;

create or replace function public.contact_fields(p_raw jsonb, p_lookup_email text default null) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare
 result jsonb:='{}'::jsonb; person jsonb; exa jsonb:='{}'::jsonb;
 entity_count integer; entity_value jsonb; properties jsonb;
 current_count integer; current_job jsonb;
 field_name text; field_limit integer; value text;
begin
 person:=case when (not(p_raw?'found') or p_raw->'found'='true'::jsonb) and jsonb_typeof(p_raw->'person')='object' then p_raw->'person' else '{}'::jsonb end;
 if jsonb_typeof(p_raw->'entities')='array' then
  select count(*)::integer,(jsonb_agg(item))->0 into entity_count,entity_value
   from jsonb_array_elements(p_raw->'entities') as entities(item)
   where jsonb_typeof(item)='object' and item->>'type'='person';
  if entity_count=1 and jsonb_typeof(entity_value->'properties')='object' then
   properties:=entity_value->'properties';
   if jsonb_typeof(properties->'firstName')='string' then exa:=exa||jsonb_build_object('first_name',properties->'firstName'); end if;
   if jsonb_typeof(properties->'lastName')='string' then exa:=exa||jsonb_build_object('last_name',properties->'lastName'); end if;
   if jsonb_typeof(properties->'workHistory')='array' then
    select count(*)::integer,(jsonb_agg(item))->0 into current_count,current_job
     from jsonb_array_elements(properties->'workHistory') as jobs(item)
     where jsonb_typeof(item)='object' and jsonb_typeof(item->'dates')='object'
      and item->'dates'->'to'='null'::jsonb;
    if current_count=1 and jsonb_typeof(current_job->'company')='object'
     and jsonb_typeof(current_job->'company'->'name')='string' then
     exa:=exa||jsonb_build_object('workplace',current_job->'company'->'name');
    end if;
   end if;
  end if;
 end if;
 for field_name,field_limit in select * from (values ('first_name',200),('last_name',200),('email',320),('phone_number',100),('workplace',500),('notes',4000)) fields(name,maximum) loop
  -- An explicit manual key suppresses native/fallback data even when cleared.
  value:=case when p_raw?field_name then case when jsonb_typeof(p_raw->field_name)='string' then p_raw->>field_name else '' end
   when jsonb_typeof(person->field_name)='string' then person->>field_name
   when jsonb_typeof(exa->field_name)='string' then exa->>field_name
   when field_name='email' then coalesce(p_lookup_email,'') else '' end;
  -- Match JavaScript string.length, including two units per supplementary char.
  if length(value)+length(regexp_replace(value,U&'[\0001-\FFFF]','','g'))>field_limit then value:=''; end if;
  result:=jsonb_set(result,array[field_name],to_jsonb(value));
 end loop;
 return result;
end $$;

-- Replacing the existing function retains its owner and ACL. Explicitly keep
-- the same service-only execution policy on repeated application as well.
revoke all on function public.contact_fields(jsonb,text) from public,anon,authenticated;
grant execute on function public.contact_fields(jsonb,text) to service_role;
comment on function public.contact_fields(jsonb,text) is 'Six bounded saved-contact strings only. Explicit top-level fields win, then observed person or one Exa person entity with an unambiguous current employer, then lookup email. No guessing or stored-row mutation.';

commit;
