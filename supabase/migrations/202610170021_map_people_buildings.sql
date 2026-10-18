-- Map identity and explicitly reported/planned presence. No inferred locations.
-- Source UUIDs/links are provenance, never source-access grants. The trusted
-- backend must check the current source allowlist/policy before every read/write.
begin;

create table public.map_people (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (display_name=btrim(display_name) and length(display_name) between 1 and 200),
 first_name text not null check (first_name=btrim(first_name) and length(first_name) between 1 and 100),
 last_name text check (last_name=btrim(last_name) and length(last_name) between 1 and 100),
 discord_user_id text unique check (discord_user_id ~ '^[1-9][0-9]{0,19}$' and discord_user_id::numeric<=18446744073709551615),
 discord_display_name text check (discord_display_name=btrim(discord_display_name) and length(discord_display_name) between 1 and 200),
 email text check (email=btrim(email) and length(email) between 3 and 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 avatar_url text unique check (length(avatar_url) between 1 and 2048 and avatar_url !~ '[[:space:][:cntrl:]]'
  and (avatar_url ~ '^/assets/avatars/[^/?#]+\.png$' or avatar_url ~ '^https://[^/?#[:space:]]+(/[^[:space:]]*)?$')),
 is_trackable boolean not null default true,
 created_at timestamptz not null default now() check (isfinite(created_at)),
 updated_at timestamptz not null default now() check (isfinite(updated_at))
);
create unique index map_people_email_lower_key on public.map_people(lower(email)) where email is not null;

create table public.map_buildings (
 id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id)<=120),
 name text not null check (name=btrim(name) and length(name) between 1 and 200),
 aliases text[] not null default '{}',
 people_here jsonb not null default '[]'::jsonb check (jsonb_typeof(people_here)='array' and jsonb_array_length(people_here)<=500),
 updated_at timestamptz not null default now() check (isfinite(updated_at))
);

comment on table public.map_people is 'Map identities; avatar seeds are not verified Discord matches or evidence of presence. Service-only access.';
comment on table public.map_buildings is 'Stable selectable map locations with bounded source-backed presence/plans. JSON provenance confers no source access.';
comment on column public.map_buildings.people_here is 'Unique person per building: person_id, status (self_reported/planned), finite valid_from/expires_at, source_id and HTTPS source_url. Reads must exclude expired/future entries and enforce source policy.';

-- Serialize map writes before taking row locks, including direct service-role
-- edits. This keeps JSON person references safe across deletion/disable/moves.
-- No locks or writes touch the five existing integration tables.
create function public.map_lock_writes() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
 return null;
end $$;
create trigger map_people_lock before insert or update or delete on public.map_people
for each statement execute function public.map_lock_writes();
create trigger map_buildings_lock before insert or update or delete on public.map_buildings
for each statement execute function public.map_lock_writes();

create function public.map_validate_building() returns trigger
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
  if jsonb_typeof(entry) is distinct from 'object' or not (entry ?& array['person_id','status','valid_from','expires_at','source_id','source_url'])
   or (select count(*) from jsonb_object_keys(entry))<>6 then
   raise check_violation using message='Invalid presence entry fields';
  end if;
  if exists(select 1 from jsonb_each(entry) e where jsonb_typeof(e.value)<>'string') then
   raise check_violation using message='Presence fields must be strings';
  end if;
  if entry->>'person_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or entry->>'source_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or entry->>'status' not in ('self_reported','planned')
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
create trigger map_buildings_validate before insert or update on public.map_buildings
for each row execute function public.map_validate_building();

create function public.map_guard_person() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then
  raise check_violation using message='Person identity cannot change';
 end if;
 if tg_op='DELETE' or (tg_op='UPDATE' and not new.is_trackable) then
  if exists(select 1 from public.map_buildings b cross join lateral jsonb_array_elements(b.people_here) e
   where (e->>'person_id')::uuid=old.id) then
   raise foreign_key_violation using message='Remove building references before deleting or disabling a person';
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' then new.created_at:=old.created_at;end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger map_people_guard before insert or update or delete on public.map_people
for each row execute function public.map_guard_person();

-- Atomic move/upsert. A self-report supersedes prior self-reports, while
-- independent plans at other buildings survive. One person/building entry is
-- permitted; the target's prior plan/report is deliberately replaced.
create function public.map_set_person_location(p_person_id uuid,p_building_id text,p_entry jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare person public.map_people;building text;
begin
 perform pg_advisory_xact_lock(hashtextextended('tech-nyu-map-presence',0));
 select * into person from public.map_people where id=p_person_id for update;
 if person.id is null or not person.is_trackable then
  raise foreign_key_violation using message='Presence requires an existing trackable person';
 end if;
 if jsonb_typeof(p_entry) is distinct from 'object' or p_entry->>'person_id' is distinct from p_person_id::text then
  raise check_violation using message='Presence person_id must match the requested person';
 end if;
 -- Lock every map building in stable order before any row update.
 for building in select b.id from public.map_buildings b order by b.id for update loop end loop;
 if not exists(select 1 from public.map_buildings b where b.id=p_building_id) then
  raise foreign_key_violation using message='Unknown map building';
 end if;
 if p_entry->>'status'='self_reported' then
  update public.map_buildings b set people_here=(select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)
   from jsonb_array_elements(b.people_here) with ordinality e(value,ordinality)
   where not ((e.value->>'person_id')::uuid=p_person_id and e.value->>'status'='self_reported'))
  where b.id<>p_building_id and exists(select 1 from jsonb_array_elements(b.people_here) e
   where (e->>'person_id')::uuid=p_person_id and e->>'status'='self_reported');
 end if;
 update public.map_buildings b set people_here=(select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)
  from jsonb_array_elements(b.people_here) with ordinality e(value,ordinality)
  where (e.value->>'person_id')::uuid<>p_person_id)||jsonb_build_array(p_entry)
 where b.id=p_building_id;
 return jsonb_build_object('person_id',p_person_id,'building_id',p_building_id,'entry',p_entry);
end $$;

-- Freshness filtering is not authorization. Backend must additionally filter
-- entry source IDs against the current live source policy for its caller.
create function public.map_get_buildings(p_at timestamptz default now())
returns table(id text,name text,aliases text[],people_here jsonb,updated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_at is null or not isfinite(p_at) then raise check_violation using message='A finite observation time is required';end if;
 return query select b.id,b.name,b.aliases,
  (select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)
   from jsonb_array_elements(b.people_here) with ordinality e(value,ordinality)
   join public.map_people p on p.id=(e.value->>'person_id')::uuid and p.is_trackable
   where (e.value->>'valid_from')::timestamptz<=p_at and (e.value->>'expires_at')::timestamptz>p_at),b.updated_at
 from public.map_buildings b order by b.id;
end $$;

-- Seed identity only. Stable IDs are namespace + exact asset filename hashes;
-- re-running these inserts preserves later names, Discord enrichment and edits.
insert into public.map_people(id,display_name,first_name,last_name,avatar_url)
select md5('tech-nyu-map-avatar-v1:'||filename)::uuid,
 replace(filename,'.png',''),split_part(replace(filename,'.png',''),' ',1),
 case when filename='Sean Lai.png' then 'Lai' else null end,
 '/assets/avatars/'||replace(filename,' ','%20')
from (values
 ('Arda.png'),('Bianca.png'),('Charice.png'),('Christine.png'),('Coco.png'),('Enoch.png'),
 ('Ethan.png'),('Fahim.png'),('Frank.png'),('Helen.png'),('Jaik.png'),('Jennifer.png'),
 ('Jiyoon.png'),('Karan.png'),('Khidir.png'),('Laura.png'),('Linkai.png'),('Marc.png'),
 ('Pope.png'),('Sean H.png'),('Sean Lai.png'),('Seth.png'),('Surya.png'),('Yoonchul.png'),
 ('Yuyang.png'),('Zach.png')) assets(filename)
on conflict (id) do nothing;

insert into public.map_buildings(id,name,aliases) values
 ('nyu-silver-center','Silver Center',array['Silver Center for Arts and Science']),
 ('nyu-kimmel-center','Kimmel Center',array['Kimmel Center for University Life','Kimmel']),
 ('nyu-global-center','Global Center (GCASL)',array['Global Center for Academic and Spiritual Life','GCASL']),
 ('nyu-leslie-elab-building','Leslie eLab building',array['Leslie Entrepreneurs Lab','Leslie eLab','16 Washington Place']),
 ('bobst-library','Bobst Library',array['Bobst','Elmer Holmes Bobst Library']),
 ('washington-square-arch','Washington Square Arch',array['Washington Square Arch']),
 ('courant-institute','Courant Institute',array['Courant','Courant Institute of Mathematical Sciences']),
 ('stern-school-of-business','Stern School of Business',array['Stern','NYU Stern']),
 ('nyu-john-a-paulson-center','John A. Paulson Center',array['Paulson Center','181 Mercer Street'])
on conflict (id) do nothing;

alter table public.map_people enable row level security;
alter table public.map_people force row level security;
alter table public.map_buildings enable row level security;
alter table public.map_buildings force row level security;
revoke all on table public.map_people,public.map_buildings from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.map_people,public.map_buildings to service_role;
revoke all on function public.map_lock_writes(),public.map_validate_building(),public.map_guard_person(),
 public.map_set_person_location(uuid,text,jsonb),public.map_get_buildings(timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.map_lock_writes(),public.map_validate_building(),public.map_guard_person(),
 public.map_set_person_location(uuid,text,jsonb),public.map_get_buildings(timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
