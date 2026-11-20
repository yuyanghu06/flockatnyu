-- Atomic merge of marketing details submitted through /event-details modals.
-- Service-only like migration 202611190057, whose tables it extends.
--
-- There are two forms. core owns title, when, location, description and food;
-- extra owns assets, collab, tagging and notes. A submission may only set or
-- clear its own form's fields, so the forms never overwrite each other.
--
-- The forms open pre-filled with the saved details, so a submission states the
-- whole form: non-blank answers in `fields` overwrite, and optional answers the
-- user blanked are listed in `clear` and removed. Each form has its own saved
-- version (core_version, extra_version). `expectedVersion` is the version of
-- that form when it was opened (0 = never saved); a save over a newer version
-- of the same form is refused with `conflict`, so a stale form never overwrites
-- or clears someone else's later answers, while a save of the other form never
-- invalidates it. The overall `version` still counts every save. The event's
-- token row is locked for the whole merge, so concurrent submissions for one
-- event, including two first submissions, run one after the other.
begin;
alter table public.marketing_event_details
 add column core_version integer not null default 0 check(core_version>=0),
 add column extra_version integer not null default 0 check(extra_version>=0);

-- Same as migration 057, plus the per-form versions the modals carry.
create or replace function public.marketing_event_lookup(p_payload jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare t public.marketing_event_tokens%rowtype; d public.marketing_event_details%rowtype;
begin
 if jsonb_typeof(p_payload) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_payload) k where k<>'token')
  or jsonb_typeof(p_payload->'token') is distinct from 'string' or p_payload->>'token' !~ '^[0-9a-f]{16}$' then return '{"status":"invalid_request"}'; end if;
 select * into t from public.marketing_event_tokens where token=p_payload->>'token';
 if not found then return '{"status":"not_found"}'; end if;
 select * into d from public.marketing_event_details where calendar_event_id=t.calendar_event_id;
 return jsonb_build_object('status','ready',
  'event',jsonb_build_object('token',t.token,'eventId',t.calendar_event_id,'title',t.title,'date',to_char(t.event_date,'YYYY-MM-DD')),
  'details',case when d.calendar_event_id is null then null else jsonb_build_object('fields',d.details,'version',d.version,
   'versions',jsonb_build_object('core',d.core_version,'extra',d.extra_version),'updatedAt',d.updated_at) end);
end $$;

create function public.marketing_event_merge(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.marketing_event_tokens%rowtype; d public.marketing_event_details%rowtype;
 form text; owned text[]; optional text[]; fields jsonb; clear_keys text[]; expected integer;
 current_version integer; cleared jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('token','form','expectedVersion','fields','clear','updatedBy'))
  or jsonb_typeof(p_payload->'token') is distinct from 'string' or p_payload->>'token' !~ '^[0-9a-f]{16}$'
  or jsonb_typeof(p_payload->'form') is distinct from 'string' or p_payload->>'form' not in ('core','extra')
  or jsonb_typeof(p_payload->'updatedBy') is distinct from 'string' or p_payload->>'updatedBy' !~ '^[0-9]{1,20}$'
  or jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number' or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,8})$'
  or jsonb_typeof(p_payload->'fields') is distinct from 'object'
  or jsonb_typeof(p_payload->'clear') is distinct from 'array' then return '{"status":"invalid_request"}'; end if;
 form:=p_payload->>'form';
 owned:=case form when 'core' then array['title','when','location','description','food'] else array['assets','collab','tagging','notes'] end;
 -- Required core fields can never be cleared.
 optional:=case form when 'core' then array['food'] else owned end;
 fields:=p_payload->'fields';
 expected:=(p_payload->>'expectedVersion')::integer;
 if exists(select 1 from jsonb_each(fields) f
   where not (f.key=any(owned)) or jsonb_typeof(f.value) is distinct from 'string'
    or btrim(f.value#>>'{}')='' or length(f.value#>>'{}')>1000)
  or exists(select 1 from jsonb_array_elements(p_payload->'clear') c
   where jsonb_typeof(c) is distinct from 'string' or not ((c#>>'{}')=any(optional)) or fields ? (c#>>'{}'))
  or (select count(*) from jsonb_array_elements(p_payload->'clear'))
   <>(select count(distinct c) from jsonb_array_elements(p_payload->'clear') c)
  or (fields='{}'::jsonb and jsonb_array_length(p_payload->'clear')=0) then return '{"status":"invalid_request"}'; end if;
 clear_keys:=array(select jsonb_array_elements_text(p_payload->'clear'));
 select * into t from public.marketing_event_tokens where token=p_payload->>'token' for update;
 if not found then return '{"status":"not_found"}'; end if;
 select * into d from public.marketing_event_details where calendar_event_id=t.calendar_event_id;
 current_version:=case when not found then 0 when form='core' then d.core_version else d.extra_version end;
 if current_version<>expected then return jsonb_build_object('status','conflict','version',current_version); end if;
 if d.calendar_event_id is not null then
  -- Report only keys that were actually saved, not blanks that were already empty.
  cleared:=coalesce((select jsonb_agg(k order by k) from unnest(clear_keys) k where d.details ? k),'[]'::jsonb);
  begin
   update public.marketing_event_details set details=(details||fields)-clear_keys,
    version=version+1,
    core_version=core_version+(form='core')::integer,
    extra_version=extra_version+(form='extra')::integer,
    updated_by=p_payload->>'updatedBy',updated_at=clock_timestamp()
    where calendar_event_id=t.calendar_event_id returning * into d;
  -- The merged object would exceed the table's 16 KiB bound.
  exception when check_violation then return '{"status":"too_large"}';
  end;
 else
  -- Clearing fields that were never saved writes nothing.
  if fields='{}'::jsonb then
   return jsonb_build_object('status','ready',
    'event',jsonb_build_object('token',t.token,'eventId',t.calendar_event_id,'title',t.title,'date',to_char(t.event_date,'YYYY-MM-DD')),
    'details',null,'cleared','[]'::jsonb);
  end if;
  begin
   insert into public.marketing_event_details(calendar_event_id,details,updated_by,core_version,extra_version)
    values(t.calendar_event_id,fields,p_payload->>'updatedBy',(form='core')::integer,(form='extra')::integer)
    returning * into d;
  exception when check_violation then return '{"status":"too_large"}';
  end;
 end if;
 return jsonb_build_object('status','ready',
  'event',jsonb_build_object('token',t.token,'eventId',t.calendar_event_id,'title',t.title,'date',to_char(t.event_date,'YYYY-MM-DD')),
  'details',jsonb_build_object('fields',d.details,'version',d.version,
   'versions',jsonb_build_object('core',d.core_version,'extra',d.extra_version),'updatedAt',d.updated_at),
  'cleared',cleared);
end $$;
revoke all on function public.marketing_event_merge(jsonb) from public,anon,authenticated;
grant execute on function public.marketing_event_merge(jsonb) to service_role;
commit;
