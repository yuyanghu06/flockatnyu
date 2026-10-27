-- Flexible CRM contact records; private to trusted server/database operations.
begin;

create table public.contacts (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now() check (isfinite(created_at)),
 updated_at timestamptz not null default now() check (isfinite(updated_at)),
 raw_input jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_input)='object')
);

create function public.contacts_set_updated_at() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.created_at:=old.created_at;
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end $$;
revoke all on function public.contacts_set_updated_at() from public,anon,authenticated,service_role;
create trigger contacts_set_updated_at before update on public.contacts
for each row execute function public.contacts_set_updated_at();

alter table public.contacts enable row level security;
alter table public.contacts force row level security;
revoke all on table public.contacts from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.contacts to service_role;

comment on table public.contacts is 'CRM contact records with flexible raw contact fields. Service-only access; no browser grants.';
comment on column public.contacts.raw_input is 'Contact details as a JSON object, for example first_name, last_name, email and phone_number. Keys are extensible and optional.';
comment on column public.contacts.created_at is 'Creation timestamp, preserved by the database on updates.';
comment on column public.contacts.updated_at is 'Last update timestamp, advanced automatically by the database on every update.';

commit;
