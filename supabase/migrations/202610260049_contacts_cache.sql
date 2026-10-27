-- Inbox sender intake, separate from saved CRM Contacts.
begin;

create table public.contacts_cache (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now() check (isfinite(created_at)),
 raw_input jsonb not null check (jsonb_typeof(raw_input) = 'object')
);

alter table public.contacts_cache enable row level security;
alter table public.contacts_cache force row level security;
revoke all on table public.contacts_cache from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.contacts_cache to service_role;

comment on table public.contacts_cache is 'Private inbox sender staging. Collector inserts one normalized email and optional plain display name; separate enrichment may process it later.';
comment on column public.contacts_cache.created_at is 'First insertion date and time.';
comment on column public.contacts_cache.raw_input is 'Inbox sender email and optional name only. No mail body, headers, message IDs or provenance.';

commit;
