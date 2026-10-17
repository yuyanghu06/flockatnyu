-- Temporary shared input buffer; processing and cleanup belong to the backend.
begin;

create table public.agent_input_cache (
 uuid uuid primary key default gen_random_uuid(),
 raw_response jsonb not null
);

comment on table public.agent_input_cache is
 'Temporary shared input buffer for Discord, email and other integrations. Backend code must enforce source allowlists and own processing, retries and cleanup.';
comment on column public.agent_input_cache.uuid is
 'Unique cache-entry identifier; cleanup targets only successfully processed UUIDs.';
comment on column public.agent_input_cache.raw_response is
 'Raw provider JSON or a source/event_type/received_at/payload envelope. No JSON schema is required; application code interprets the input.';

alter table public.agent_input_cache enable row level security;
alter table public.agent_input_cache force row level security;
revoke all on table public.agent_input_cache from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.agent_input_cache to service_role;

notify pgrst,'reload schema';
commit;
