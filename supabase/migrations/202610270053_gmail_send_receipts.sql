-- Private operational metadata only. Never store email addresses, subject/body,
-- native messages, credentials or source content. Dispatch markers never expire
-- into another send, including when a process dies before recording an outcome.
begin;
create table public.gmail_send_receipts (
 actor_hash text not null check(actor_hash ~ '^[0-9a-f]{64}$'),
 request_id uuid not null,
 sender_hash text not null check(sender_hash ~ '^[0-9a-f]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 group_id uuid not null,
 ordinal integer not null check(ordinal between 0 and 31),
 status text not null check(status in ('dispatching','sent','failed','unknown')),
 group_blocked boolean not null default false,
 dispatch_token uuid not null default gen_random_uuid(),
 message_id text check(message_id ~ '^[a-fA-F0-9]{1,64}$'),
 thread_id text check(thread_id ~ '^[a-fA-F0-9]{1,64}$'),
 reason text check(reason in ('not_configured','disabled','reauthorization_required','account_mismatch','forbidden','invalid_request',
  'rate_limited','google_unavailable','aborted','timeout','invalid_response','response_too_large','unavailable','write_outcome_unknown')),
 created_at timestamptz not null default clock_timestamp() check(isfinite(created_at)),
 updated_at timestamptz not null default clock_timestamp() check(isfinite(updated_at)),
 finished_at timestamptz check(finished_at is null or isfinite(finished_at)),
 primary key(actor_hash,request_id),
 unique(actor_hash,group_id,ordinal),
 check((status='dispatching' and finished_at is null and message_id is null and thread_id is null and reason is null)
  or (status='sent' and finished_at is not null and message_id is not null and reason is null)
  or (status='failed' and finished_at is not null and message_id is null and thread_id is null and reason is not null and reason<>'write_outcome_unknown')
  or (status='unknown' and finished_at is not null and message_id is null and thread_id is null and reason='write_outcome_unknown'))
);
create index gmail_send_receipts_uncertain on public.gmail_send_receipts(actor_hash,group_id) where status in ('dispatching','unknown');
alter table public.gmail_send_receipts enable row level security;
alter table public.gmail_send_receipts force row level security;
revoke all on public.gmail_send_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.gmail_send_receipts to service_role;
comment on table public.gmail_send_receipts is 'Service-only Gmail send idempotency metadata. HMAC actor/sender/payload bindings, IDs and outcomes only. No message content or addresses. No automatic deletion or redispatch of uncertain operations.';

create function public._gmail_send_receipt(r public.gmail_send_receipts) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('actorHash',r.actor_hash,'senderHash',r.sender_hash,'payloadHash',r.payload_hash,
  'requestId',r.request_id,'groupId',r.group_id,'ordinal',r.ordinal,'status',r.status,
  'messageId',r.message_id,'threadId',r.thread_id,'reason',r.reason,'createdAt',r.created_at,'updatedAt',r.updated_at)
$$;
create function public.gmail_send_probe(p_payload jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('status','ready','contract','gmail-send-receipts-v1')
$$;

create function public.gmail_send_claim(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.gmail_send_receipts%rowtype; actor_value text; request_value uuid; group_value uuid; ordinal_value integer;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('actorHash','senderHash','payloadHash','requestId','groupId','ordinal'))
  or (select count(*) from jsonb_object_keys(p_payload))<>6
  or jsonb_typeof(p_payload->'actorHash') is distinct from 'string' or p_payload->>'actorHash' !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_payload->'senderHash') is distinct from 'string' or p_payload->>'senderHash' !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_payload->'payloadHash') is distinct from 'string' or p_payload->>'payloadHash' !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string' or p_payload->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_payload->'groupId') is distinct from 'string' or p_payload->>'groupId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_payload->'ordinal') is distinct from 'number' or p_payload->>'ordinal' !~ '^(0|[1-9][0-9]?)$' then return '{"status":"invalid_request"}'; end if;
 ordinal_value:=(p_payload->>'ordinal')::integer;
 if ordinal_value>31 then return '{"status":"invalid_request"}'; end if;
 actor_value:=p_payload->>'actorHash'; request_value:=(p_payload->>'requestId')::uuid; group_value:=(p_payload->>'groupId')::uuid;
 -- Serialize metadata transitions for this actor. The lock never spans Google.
 perform pg_advisory_xact_lock(hashtextextended('flock-gmail-send:'||actor_value,0));
 select * into r from public.gmail_send_receipts where actor_hash=actor_value and request_id=request_value for update;
 if found then
  if r.sender_hash is distinct from p_payload->>'senderHash' or r.payload_hash is distinct from p_payload->>'payloadHash'
   or r.group_id<>group_value or r.ordinal<>ordinal_value then
   -- A changed operation cannot be bypassed with another ordinal after restart.
   if r.group_id=group_value then update public.gmail_send_receipts set group_blocked=true where actor_hash=actor_value and group_id=group_value; end if;
   return '{"status":"conflict"}'; end if;
  return jsonb_build_object('status','ready','receipt',public._gmail_send_receipt(r));
 end if;
 if exists(select 1 from public.gmail_send_receipts where actor_hash=actor_value and group_id=group_value and group_blocked) then return '{"status":"conflict"}'; end if;
 if exists(select 1 from public.gmail_send_receipts where actor_hash=actor_value and group_id=group_value and status in ('dispatching','unknown')) then
  return '{"status":"blocked","reason":"write_outcome_unknown"}';
 end if;
 if exists(select 1 from public.gmail_send_receipts where actor_hash=actor_value and group_id=group_value and ordinal=ordinal_value) then
  update public.gmail_send_receipts set group_blocked=true where actor_hash=actor_value and group_id=group_value;
  return '{"status":"conflict"}'; end if;
 insert into public.gmail_send_receipts(actor_hash,request_id,sender_hash,payload_hash,group_id,ordinal,status)
  values(actor_value,request_value,p_payload->>'senderHash',p_payload->>'payloadHash',group_value,ordinal_value,'dispatching') returning * into r;
 return jsonb_build_object('status','claimed','token',r.dispatch_token,'receipt',public._gmail_send_receipt(r));
end $$;

create function public.gmail_send_finish(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.gmail_send_receipts%rowtype; state_value text; reason_value text; message_value text; thread_value text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4096
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('actorHash','requestId','token','status','messageId','threadId','reason'))
  or jsonb_typeof(p_payload->'actorHash') is distinct from 'string' or p_payload->>'actorHash' !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string' or p_payload->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_payload->'token') is distinct from 'string' or p_payload->>'token' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_payload->'status') is distinct from 'string' or p_payload->>'status' not in ('sent','failed','unknown') then return '{"status":"invalid_request"}'; end if;
 state_value:=p_payload->>'status'; reason_value:=p_payload->>'reason'; message_value:=p_payload->>'messageId'; thread_value:=p_payload->>'threadId';
 if state_value='sent' then
  if jsonb_typeof(p_payload->'messageId') is distinct from 'string' or message_value !~ '^[a-fA-F0-9]{1,64}$'
   or p_payload?'reason' or (p_payload?'threadId' and (jsonb_typeof(p_payload->'threadId') is distinct from 'string' or thread_value !~ '^[a-fA-F0-9]{1,64}$')) then return '{"status":"invalid_request"}'; end if;
 else
  if p_payload?'messageId' or p_payload?'threadId' or jsonb_typeof(p_payload->'reason') is distinct from 'string'
   or reason_value not in ('not_configured','disabled','reauthorization_required','account_mismatch','forbidden','invalid_request','rate_limited','google_unavailable','aborted','timeout','invalid_response','response_too_large','unavailable','write_outcome_unknown')
   or (state_value='unknown') is distinct from (reason_value='write_outcome_unknown') then return '{"status":"invalid_request"}'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('flock-gmail-send:'||(p_payload->>'actorHash'),0));
 select * into r from public.gmail_send_receipts where actor_hash=p_payload->>'actorHash' and request_id=(p_payload->>'requestId')::uuid for update;
 if not found then return '{"status":"not_found"}'; end if;
 if r.dispatch_token<>(p_payload->>'token')::uuid then return '{"status":"conflict"}'; end if;
 if r.status<>'dispatching' then
  if r.status<>state_value or r.reason is distinct from reason_value or r.message_id is distinct from message_value or r.thread_id is distinct from thread_value then return '{"status":"conflict"}'; end if;
  return jsonb_build_object('status','ready','receipt',public._gmail_send_receipt(r));
 end if;
 update public.gmail_send_receipts set status=state_value,reason=reason_value,message_id=message_value,thread_id=thread_value,
  updated_at=clock_timestamp(),finished_at=clock_timestamp() where actor_hash=r.actor_hash and request_id=r.request_id returning * into r;
 return jsonb_build_object('status','ready','receipt',public._gmail_send_receipt(r));
end $$;

create function public.gmail_send_read(p_payload jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r public.gmail_send_receipts%rowtype;
begin
 if jsonb_typeof(p_payload) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_payload))<>2
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('actorHash','requestId'))
  or jsonb_typeof(p_payload->'actorHash') is distinct from 'string' or p_payload->>'actorHash' !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string' or p_payload->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return '{"status":"invalid_request"}'; end if;
 select * into r from public.gmail_send_receipts where actor_hash=p_payload->>'actorHash' and request_id=(p_payload->>'requestId')::uuid;
 if not found then return '{"status":"not_found"}'; end if;
 return jsonb_build_object('status','ready','receipt',public._gmail_send_receipt(r));
end $$;
revoke all on function public._gmail_send_receipt(public.gmail_send_receipts),public.gmail_send_probe(jsonb),public.gmail_send_claim(jsonb),public.gmail_send_finish(jsonb),public.gmail_send_read(jsonb) from public,anon,authenticated;
grant execute on function public._gmail_send_receipt(public.gmail_send_receipts),public.gmail_send_probe(jsonb),public.gmail_send_claim(jsonb),public.gmail_send_finish(jsonb),public.gmail_send_read(jsonb) to service_role;
commit;
