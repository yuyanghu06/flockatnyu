-- Marketing event details for the events/marketing Discord commands.
-- Service-only: the discord-events worker reaches these through fixed RPCs with
-- the service role. Browser roles have no access. This is separate from the
-- map's public.events table, which it neither reads nor references.
--
-- marketing_event_tokens: short stable handles for Google Calendar event IDs.
--   Discord select-option values and component IDs are limited to 100
--   characters, while Calendar event IDs may be up to 1024.
-- marketing_event_details: details submitted for an event (written in a later
--   migration's merge RPC). Keyed by the Calendar event ID.
begin;
create table public.marketing_event_tokens (
 token text primary key check(token ~ '^[0-9a-f]{16}$'),
 calendar_event_id text not null unique check(calendar_event_id ~ '^[A-Za-z0-9_-]+$' and length(calendar_event_id) between 5 and 1024),
 title text not null check(length(title) between 1 and 300),
 event_date date not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.marketing_event_details (
 calendar_event_id text primary key references public.marketing_event_tokens(calendar_event_id) on delete cascade,
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object' and octet_length(details::text)<=16384),
 version integer not null default 1 check(version>=1),
 updated_by text check(updated_by ~ '^[0-9]{1,20}$'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.marketing_event_tokens enable row level security;
alter table public.marketing_event_tokens force row level security;
alter table public.marketing_event_details enable row level security;
alter table public.marketing_event_details force row level security;
revoke all on public.marketing_event_tokens, public.marketing_event_details from public,anon,authenticated,service_role;
grant select,insert,update on public.marketing_event_tokens, public.marketing_event_details to service_role;
comment on table public.marketing_event_tokens is 'Service-only short Discord handles for Google Calendar event IDs used by the marketing commands. Not the map events table.';
comment on table public.marketing_event_details is 'Service-only marketing details submitted through Discord for a Calendar event. Not the map events table.';

create function public.marketing_event_token(p_event_id text) returns text
language sql immutable strict set search_path='' as $$
 select left(encode(sha256(convert_to(p_event_id,'UTF8')),'hex'),16)
$$;

-- Upserts up to 25 offered events (one Discord select menu) and returns their tokens.
create function public.marketing_event_register(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; result jsonb:='[]'::jsonb; token_value text; existing text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536
  or exists(select 1 from jsonb_object_keys(p_payload) k where k<>'events')
  or jsonb_typeof(p_payload->'events') is distinct from 'array'
  or jsonb_array_length(p_payload->'events') not between 1 and 25 then return '{"status":"invalid_request"}'; end if;
 for item in select value from jsonb_array_elements(p_payload->'events') loop
  if jsonb_typeof(item) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(item) k where k not in ('eventId','title','date'))
   or jsonb_typeof(item->'eventId') is distinct from 'string' or item->>'eventId' !~ '^[A-Za-z0-9_-]+$' or length(item->>'eventId') not between 5 and 1024
   or jsonb_typeof(item->'title') is distinct from 'string' or length(item->>'title') not between 1 and 300
   or jsonb_typeof(item->'date') is distinct from 'string' or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return '{"status":"invalid_request"}'; end if;
  -- Impossible calendar dates (for example Feb 30) are rejected, not raised.
  begin
   if to_char((item->>'date')::date,'YYYY-MM-DD')<>item->>'date' then return '{"status":"invalid_request"}'; end if;
  exception when others then return '{"status":"invalid_request"}';
  end;
 end loop;
 for item in select value from jsonb_array_elements(p_payload->'events') loop
  token_value:=public.marketing_event_token(item->>'eventId');
  select calendar_event_id into existing from public.marketing_event_tokens where token=token_value;
  -- A truncated-hash collision must never redirect one event's details to another.
  if found and existing<>item->>'eventId' then return '{"status":"conflict"}'; end if;
  insert into public.marketing_event_tokens(token,calendar_event_id,title,event_date)
   values(token_value,item->>'eventId',item->>'title',(item->>'date')::date)
   on conflict(calendar_event_id) do update set title=excluded.title,event_date=excluded.event_date,updated_at=clock_timestamp()
    where public.marketing_event_tokens.title is distinct from excluded.title or public.marketing_event_tokens.event_date is distinct from excluded.event_date;
  result:=result||jsonb_build_array(jsonb_build_object('eventId',item->>'eventId','token',token_value));
 end loop;
 return jsonb_build_object('status','ready','tokens',result);
end $$;

-- Resolves a token to its event and any submitted details (null when none yet).
create function public.marketing_event_lookup(p_payload jsonb) returns jsonb
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
  'details',case when d.calendar_event_id is null then null else jsonb_build_object('fields',d.details,'version',d.version,'updatedAt',d.updated_at) end);
end $$;

revoke all on function public.marketing_event_token(text),public.marketing_event_register(jsonb),public.marketing_event_lookup(jsonb) from public,anon,authenticated;
grant execute on function public.marketing_event_token(text),public.marketing_event_register(jsonb),public.marketing_event_lookup(jsonb) to service_role;
commit;
