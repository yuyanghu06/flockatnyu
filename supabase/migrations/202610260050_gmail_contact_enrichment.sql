-- Read-only sender intake -> Treg -> native Contacts. This migration is local
-- and unapplied. Tracking tables contain metadata only, never provider payloads.
begin;

create table public.contacts_enrichment_state (
 singleton boolean primary key default true check(singleton),
 source_ids uuid[] not null check(cardinality(source_ids) between 1 and 100),
 account text not null check(length(account) between 3 and 320 and account=lower(btrim(account))),
 budget_day date not null default (clock_timestamp() at time zone 'UTC')::date,
 day_spent_micro bigint not null default 0 check(day_spent_micro>=0),
 day_requests jsonb not null default '{}'::jsonb check(jsonb_typeof(day_requests)='object'),
 cycles jsonb not null default '{}'::jsonb check(jsonb_typeof(cycles)='object'),
 lease_job_id uuid, lease_cache_id uuid, lease_token uuid, lease_expires_at timestamptz,
 check((lease_job_id is null and lease_cache_id is null and lease_token is null and lease_expires_at is null)
  or (lease_job_id is not null and lease_cache_id is not null and lease_token is not null and lease_expires_at is not null and isfinite(lease_expires_at)))
);
create table public.contacts_enrichment_jobs (
 id uuid primary key default gen_random_uuid(),
 cache_id uuid not null,
 source_version text not null check(source_version ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp() check(isfinite(created_at)),
 request_id uuid not null unique default gen_random_uuid(),
 version bigint not null default 1 check(version>=1),
 attempts integer not null default 0 check(attempts between 0 and 5),
 status text not null default 'pending' check(status in ('pending','retry','completed','quarantined')),
 available_at timestamptz not null default clock_timestamp() check(isfinite(available_at)),
 reserved_micro bigint not null default 0 check(reserved_micro>=0),
 reservation_day date, reservation_cycle uuid, reservation_reused boolean not null default false,
 outcome text check(outcome in ('hit','miss','unsupported_raw')),
 reason text check(reason in ('aborted','unavailable','forbidden','invalid_response','response_too_large','rate_limited',
  'budget_exceeded','log_unavailable','schema_not_ready','write_outcome_unknown','invalid_email','unsupported_raw',
  'raw_too_large','lease_lost','cache_save_failed','retry_limit')),
 contact_id uuid, contact_operation text check(contact_operation in ('imported','existing')),
 usage_provider text, usage_call_id text, usage_cost_micro bigint check(usage_cost_micro>=0),
 cost_overrun boolean not null default false,
 uncertain boolean not null default false,
 completed_at timestamptz check(completed_at is null or isfinite(completed_at)),
 unique(cache_id,source_version),
 check((status='completed' and outcome is not null and completed_at is not null) or (status<>'completed' and completed_at is null)),
 check((outcome='hit' and contact_id is not null and contact_operation is not null) or (outcome is distinct from 'hit' and contact_id is null and contact_operation is null))
);
-- No cache foreign-key trigger is needed: explicit source locks below maintain
-- state -> job -> original lock order. Deleted originals leave harmless metadata.
alter table public.contacts_enrichment_state enable row level security;
alter table public.contacts_enrichment_state force row level security;
alter table public.contacts_enrichment_jobs enable row level security;
alter table public.contacts_enrichment_jobs force row level security;
revoke all on table public.contacts_enrichment_state,public.contacts_enrichment_jobs from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.contacts_enrichment_state,public.contacts_enrichment_jobs to service_role;
comment on table public.contacts_enrichment_state is 'Private configured intake scope, global lease and UTC-day/cycle monetary reservations. JSON maps contain only request UUIDs and integer costs.';
comment on table public.contacts_enrichment_jobs is 'Private metadata-only processing receipts keyed to an unchanged sender-cache fingerprint. No sender email/name, provider body, raw contact, enrichment envelope or full contact snapshot is stored here.';
create function public._gmail_enrichment_email(p_email text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_email is not null and length(p_email) between 3 and 320 and p_email=lower(btrim(p_email))
 and p_email !~ '[[:space:]<>@,;].*@' and p_email ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'
 and p_email !~ '[[:cntrl:]]'
$$;
create function public._gmail_enrichment_source_version(p_raw jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(p_raw::text,'UTF8')),'hex')
$$;
create function public._gmail_enrichment_contact_id(p_email text) returns uuid
language plpgsql immutable security invoker set search_path='' as $$
declare v text;
begin
 v:=substr(encode(sha256(convert_to('flockatnyu:treg-contact:v1:email:'||lower(p_email),'UTF8')),'hex'),1,32);
 v:=overlay(v placing '8' from 13 for 1);
 v:=overlay(v placing substr('89ab',((strpos('0123456789abcdef',substr(v,17,1))-1)%4)+1,1) from 17 for 1);
 return (substr(v,1,8)||'-'||substr(v,9,4)||'-'||substr(v,13,4)||'-'||substr(v,17,4)||'-'||substr(v,21,12))::uuid;
end $$;
create function public._gmail_enrichment_scope(p_payload jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare ids uuid[]; account_name text;
begin
 if jsonb_typeof(p_payload)<>'object' or p_payload->>'scope' is distinct from 'sender'
 or jsonb_typeof(p_payload->'sourceIds') is distinct from 'array'
 or jsonb_array_length(p_payload->'sourceIds') not between 1 and 100
 or jsonb_typeof(p_payload->'account') is distinct from 'string' then return '{"status":"invalid_request"}'; end if;
 account_name:=p_payload->>'account';
 if not public._gmail_enrichment_email(account_name) then return '{"status":"invalid_request"}'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'sourceIds') x
  where jsonb_typeof(x)<>'string' or x#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then return '{"status":"invalid_request"}'; end if;
 select array_agg(distinct value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_payload->'sourceIds');
 if cardinality(ids)<>jsonb_array_length(p_payload->'sourceIds') then return '{"status":"invalid_request"}'; end if;
 return jsonb_build_object('status','ready','sourceIds',to_jsonb(ids),'account',account_name,'scope','sender');
end $$;
create function public._gmail_enrichment_time(p_value text) returns timestamptz
language plpgsql immutable security invoker set search_path='' as $$
begin return p_value::timestamptz; exception when others then return 'epoch'::timestamptz; end $$;

-- Count compact JSON bytes without stripping spaces inside native strings.
create function public._gmail_enrichment_json_bytes(p_value jsonb) returns bigint
language plpgsql immutable security invoker set search_path='' as $$
declare total bigint; count_items bigint;
begin
 if jsonb_typeof(p_value)='array' then
  select coalesce(sum(public._gmail_enrichment_json_bytes(value)),0),count(*) into total,count_items from jsonb_array_elements(p_value);
  return total+greatest(count_items-1,0)+2;
 elsif jsonb_typeof(p_value)='object' then
  select coalesce(sum(octet_length(to_jsonb(key)::text)+1+public._gmail_enrichment_json_bytes(value)),0),count(*)
   into total,count_items from jsonb_each(p_value);
  return total+greatest(count_items-1,0)+2;
 else return octet_length(p_value::text); end if;
end $$;

create function public._gmail_enrichment_claim_json(p_job_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare j public.contacts_enrichment_jobs%rowtype; s public.contacts_enrichment_state%rowtype; r public.contacts_cache%rowtype;
begin
 select * into j from public.contacts_enrichment_jobs where id=p_job_id;
 select * into s from public.contacts_enrichment_state where singleton;
 select * into r from public.contacts_cache where id=j.cache_id;
 return jsonb_build_object('id',j.cache_id,'jobId',j.id,'sourceId',s.source_ids[1],'account',s.account,
  'personKey',r.raw_input->>'email','email',r.raw_input->>'email','sourceVersion',j.source_version,'version',j.version::text,
  'requestId',j.request_id,'leaseToken',s.lease_token,'leaseExpiresAt',s.lease_expires_at,'budgetReservedMicro',j.reserved_micro);
end $$;
create function public._gmail_enrichment_receipt(p_job_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('jobId',j.id,'cacheId',j.cache_id,'sourceVersion',j.source_version,'requestId',j.request_id,
  'version',j.version::text,'outcome',j.outcome,'contactId',j.contact_id,'operation',j.contact_operation,'reason',j.reason,
  'usage',jsonb_build_object('provider',j.usage_provider,'callId',j.usage_call_id,'costMicro',j.usage_cost_micro))
 from public.contacts_enrichment_jobs j where j.id=p_job_id
$$;

-- All mutation paths take state, then job, then original cache locks. The cache
-- lock authorizes an exact fingerprint only; this service never changes it.
create function public._gmail_enrichment_lock(p_claim jsonb,p_allow_completed boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.contacts_enrichment_jobs%rowtype; s public.contacts_enrichment_state%rowtype; r public.contacts_cache%rowtype;
begin
 if jsonb_typeof(p_claim) is distinct from 'object' or exists(select 1 from
  unnest(array['id','jobId','sourceId','account','personKey','email','requestId','leaseToken','sourceVersion','version']) k
  where jsonb_typeof(p_claim->k) is distinct from 'string')
  or coalesce(p_claim->>'jobId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return '{"status":"invalid_request"}'; end if;
 select * into s from public.contacts_enrichment_state where singleton for update;
 if not found then return '{"status":"stale"}'; end if;
 select * into j from public.contacts_enrichment_jobs where id=(p_claim->>'jobId')::uuid for update;
 if not found then return '{"status":"stale"}'; end if;
 select * into r from public.contacts_cache where id=j.cache_id for update;
 if not found or p_claim->>'id' is distinct from j.cache_id::text
  or p_claim->>'sourceVersion' is distinct from j.source_version or j.source_version is distinct from public._gmail_enrichment_source_version(r.raw_input)
  or p_claim->>'version' is distinct from j.version::text or p_claim->>'requestId' is distinct from j.request_id::text
  or p_claim->>'account' is distinct from s.account or p_claim->>'sourceId' is distinct from s.source_ids[1]::text
  or p_claim->>'email' is distinct from r.raw_input->>'email' or p_claim->>'personKey' is distinct from r.raw_input->>'email'
  then return '{"status":"stale"}'; end if;
 if p_allow_completed and j.status='completed' then return '{"status":"ready","completed":true}'; end if;
 if j.status not in ('pending','retry') or s.lease_job_id is distinct from j.id or s.lease_cache_id is distinct from j.cache_id
  or s.lease_token::text is distinct from p_claim->>'leaseToken' or s.lease_expires_at is null or s.lease_expires_at<=clock_timestamp()
  then return '{"status":"stale"}'; end if;
 return '{"status":"ready","completed":false}';
end $$;
create function public.gmail_enrichment_probe(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare scope_data jsonb; s public.contacts_enrichment_state%rowtype;
begin
 scope_data:=public._gmail_enrichment_scope(p_payload);
 if scope_data->>'status'<>'ready' then return scope_data; end if;
 select * into s from public.contacts_enrichment_state where singleton;
 if found and (to_jsonb(s.source_ids)<>scope_data->'sourceIds' or s.account<>scope_data->>'account') then return '{"status":"forbidden"}'; end if;
 return scope_data||jsonb_build_object('contract','gmail-enrichment-v2','table','contacts_cache',
  'capabilities',jsonb_build_object('atomicClaims',true,'versionChecks',true,'durableRequestIds',true,'durableBudget',true,
   'readOnlyCache',true,'metadataOnlyJobs',true,'atomicContactCompletion',true));
end $$;

create function public.gmail_enrichment_claim(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.contacts_enrichment_state%rowtype; j public.contacts_enrichment_jobs%rowtype; r public.contacts_cache%rowtype;
 scope_data jsonb; now_at timestamptz:=clock_timestamp(); utc_day date:=(clock_timestamp() at time zone 'UTC')::date;
 ids uuid[]; seconds integer; reserve_amount bigint; cycle_cap bigint; day_cap bigint; cycle_id text;
 candidate_id uuid; candidate_version text; day_values jsonb; cycle_values jsonb; day_old bigint; cycle_old bigint;
 cycle_total bigint; day_add bigint; cycle_add bigint; pass integer;
begin
 scope_data:=public._gmail_enrichment_scope(p_payload);
 if scope_data->>'status'<>'ready' then return scope_data; end if;
 if coalesce(p_payload->>'leaseSeconds','') !~ '^[0-9]{2,3}$'
  or coalesce(p_payload->>'reserveMicro','') !~ '^[1-9][0-9]{0,6}$'
  or coalesce(p_payload->>'maxCycleCostMicro','') !~ '^[1-9][0-9]{0,8}$'
  or coalesce(p_payload->>'maxDailyCostMicro','') !~ '^[1-9][0-9]{0,8}$'
  or coalesce(p_payload->>'cycleId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return '{"status":"invalid_request"}'; end if;
 seconds:=(p_payload->>'leaseSeconds')::integer; reserve_amount:=(p_payload->>'reserveMicro')::bigint;
 cycle_cap:=(p_payload->>'maxCycleCostMicro')::bigint; day_cap:=(p_payload->>'maxDailyCostMicro')::bigint; cycle_id:=lower(p_payload->>'cycleId');
 if seconds not between 90 and 600 or reserve_amount>1000000 or cycle_cap not between reserve_amount and 100000000
  or day_cap not between cycle_cap and 100000000 then return '{"status":"invalid_request"}'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(scope_data->'sourceIds');
 select * into s from public.contacts_enrichment_state where singleton for update skip locked;
 if not found then
  if exists(select 1 from public.contacts_enrichment_state where singleton) then return '{"status":"empty"}'; end if;
  insert into public.contacts_enrichment_state(singleton,source_ids,account) values(true,ids,scope_data->>'account') on conflict do nothing;
  select * into s from public.contacts_enrichment_state where singleton for update skip locked;
  if not found then return '{"status":"empty"}'; end if;
 end if;
 if s.source_ids<>ids or s.account<>scope_data->>'account' then return '{"status":"forbidden"}'; end if;
 if s.lease_token is not null and s.lease_expires_at>now_at then return '{"status":"empty"}'; end if;
 if s.budget_day<>utc_day then
  update public.contacts_enrichment_state set budget_day=utc_day,day_spent_micro=0,day_requests='{}',cycles='{}',
   lease_job_id=null,lease_cache_id=null,lease_token=null,lease_expires_at=null where singleton returning * into s;
 else update public.contacts_enrichment_state set lease_job_id=null,lease_cache_id=null,lease_token=null,lease_expires_at=null where singleton; end if;
 for pass in 1..20 loop
  select c.id,public._gmail_enrichment_source_version(c.raw_input) into candidate_id,candidate_version
   from public.contacts_cache c left join public.contacts_enrichment_jobs job
    on job.cache_id=c.id and job.source_version=public._gmail_enrichment_source_version(c.raw_input)
   where job.id is null or (job.status in ('pending','retry') and job.available_at<=now_at)
   order by c.created_at,c.id limit 1;
  if not found then return '{"status":"empty"}'; end if;
  insert into public.contacts_enrichment_jobs(cache_id,source_version) values(candidate_id,candidate_version) on conflict(cache_id,source_version) do nothing;
  select * into j from public.contacts_enrichment_jobs where cache_id=candidate_id and source_version=candidate_version for update skip locked;
  if not found then continue; end if;
  select * into r from public.contacts_cache where id=candidate_id for update skip locked;
  if not found or public._gmail_enrichment_source_version(r.raw_input)<>j.source_version then continue; end if;
  if not public._gmail_enrichment_email(r.raw_input->>'email') or jsonb_typeof(r.raw_input->'email') is distinct from 'string' then
   update public.contacts_enrichment_jobs set status='quarantined',reason='invalid_email' where id=j.id; continue;
  end if;
  if j.attempts>=5 then update public.contacts_enrichment_jobs set status='quarantined',reason='retry_limit' where id=j.id; continue; end if;
  day_values:=s.day_requests; cycle_values:=coalesce(s.cycles->cycle_id,'{}');
  day_old:=coalesce((day_values->>j.request_id::text)::bigint,0); cycle_old:=coalesce((cycle_values->>j.request_id::text)::bigint,0);
  day_add:=case when day_values?j.request_id::text then 0 else reserve_amount end;
  cycle_add:=case when cycle_values?j.request_id::text then 0 else reserve_amount end;
  select coalesce(sum(value::bigint),0) into cycle_total from jsonb_each_text(cycle_values);
  if s.day_spent_micro+day_add>day_cap or cycle_total+cycle_add>cycle_cap
   or (not(s.cycles?cycle_id) and (select count(*) from jsonb_object_keys(s.cycles))>=2048)
   or (not(day_values?j.request_id::text) and (select count(*) from jsonb_object_keys(day_values))>=4096) then return '{"status":"budget_exceeded"}'; end if;
  day_values:=jsonb_set(day_values,array[j.request_id::text],to_jsonb(day_old+day_add));
  cycle_values:=jsonb_set(cycle_values,array[j.request_id::text],to_jsonb(cycle_old+cycle_add));
  update public.contacts_enrichment_jobs set attempts=attempts+1,status='pending',available_at=now_at,
   reserved_micro=greatest(day_old,reserve_amount),reservation_day=utc_day,reservation_cycle=cycle_id::uuid,
   reservation_reused=s.day_requests?j.request_id::text where id=j.id;
  update public.contacts_enrichment_state set day_spent_micro=day_spent_micro+day_add,day_requests=day_values,
   cycles=jsonb_set(cycles,array[cycle_id],cycle_values),lease_job_id=j.id,lease_cache_id=j.cache_id,
   lease_token=gen_random_uuid(),lease_expires_at=now_at+make_interval(secs=>seconds) where singleton;
  return jsonb_build_object('status','ready','claim',public._gmail_enrichment_claim_json(j.id));
 end loop;
 return '{"status":"empty"}';
end $$;

create function public.gmail_enrichment_renew(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare locked jsonb; seconds integer;
begin
 if coalesce(p_payload->>'leaseSeconds','') !~ '^[0-9]{2,3}$' then return '{"status":"invalid_request"}'; end if;
 seconds:=(p_payload->>'leaseSeconds')::integer;
 if seconds not between 90 and 600 then return '{"status":"invalid_request"}'; end if;
 locked:=public._gmail_enrichment_lock(p_payload->'claim');
 if locked->>'status'<>'ready' then return locked; end if;
 update public.contacts_enrichment_state set lease_expires_at=clock_timestamp()+make_interval(secs=>seconds) where singleton;
 return jsonb_build_object('status','ready','claim',public._gmail_enrichment_claim_json((p_payload->'claim'->>'jobId')::uuid));
end $$;

create function public.gmail_enrichment_complete(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare locked jsonb; s public.contacts_enrichment_state%rowtype; j public.contacts_enrichment_jobs%rowtype;
 r public.contacts_cache%rowtype; contact_row public.contacts%rowtype; usage_data jsonb:=p_payload->'usage';
 outcome_value text:=p_payload->>'outcome'; reason_value text; raw_value jsonb:=p_payload->'rawInput';
 expected_id uuid; saved_contact_id uuid; operation text; old_day bigint; old_cycle bigint; cost_value bigint; charge bigint; cycle_charge bigint;
begin
 if jsonb_typeof(p_payload->'outcome') is distinct from 'string' or outcome_value not in ('hit','miss','unsupported_raw')
  or jsonb_typeof(usage_data) is distinct from 'object' or jsonb_typeof(usage_data->'provider') is distinct from 'string'
  or usage_data->>'provider' !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' or not(usage_data?'callId') or not(usage_data?'costMicro')
  or not(usage_data->'callId'='null'::jsonb or (jsonb_typeof(usage_data->'callId')='string' and usage_data->>'callId' ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'))
  or not(usage_data->'costMicro'='null'::jsonb or (jsonb_typeof(usage_data->'costMicro')='number'
    and usage_data->>'costMicro' ~ '^(0|[1-9][0-9]{0,15})$' and (usage_data->>'costMicro')::numeric<=9007199254740991))
  or octet_length(p_payload::text)>1100000 then return '{"status":"invalid_request"}'; end if;
 if outcome_value='hit' then
  if jsonb_typeof(raw_value) is distinct from 'object' or public._gmail_enrichment_json_bytes(raw_value)>254976 or p_payload?'reason' then return '{"status":"invalid_request"}'; end if;
 elsif p_payload?'rawInput' then return '{"status":"invalid_request"}'; end if;
 if outcome_value='unsupported_raw' then
  if jsonb_typeof(p_payload->'reason') is distinct from 'string' or p_payload->>'reason' not in ('unsupported_raw','raw_too_large') then return '{"status":"invalid_request"}'; end if;
  reason_value:=p_payload->>'reason';
 elsif p_payload?'reason' then return '{"status":"invalid_request"}'; end if;
 locked:=public._gmail_enrichment_lock(p_payload->'claim',true);
 if locked->>'status'<>'ready' then return locked; end if;
 select * into j from public.contacts_enrichment_jobs where id=(p_payload->'claim'->>'jobId')::uuid;
 if (locked->>'completed')::boolean then
  if j.outcome is distinct from outcome_value or j.reason is distinct from reason_value then return '{"status":"conflict"}'; end if;
  if j.outcome='hit' then
   if not exists(select 1 from public.contacts where id=j.contact_id) then return '{"status":"conflict"}'; end if;
   update public.contacts_enrichment_jobs set contact_operation='existing' where id=j.id;
  end if;
  return jsonb_build_object('status','ready','receipt',public._gmail_enrichment_receipt(j.id));
 end if;
 select * into s from public.contacts_enrichment_state where singleton;
 select * into r from public.contacts_cache where id=j.cache_id;
 if outcome_value='hit' then
  expected_id:=public._gmail_enrichment_contact_id(r.raw_input->>'email');
  select * into contact_row from public.contacts where lower(raw_input->>'email')=r.raw_input->>'email' order by created_at,id limit 1 for share;
  if found then operation:='existing';
  else
   insert into public.contacts(id,raw_input) values(expected_id,raw_value) on conflict(id) do nothing returning * into contact_row;
   if found then operation:='imported'; else
    select * into contact_row from public.contacts where id=expected_id for share;
    if not found then return '{"status":"conflict"}'; end if;
    operation:='existing';
   end if;
  end if;
  saved_contact_id:=contact_row.id;
 end if;
 old_day:=coalesce((s.day_requests->>j.request_id::text)::bigint,0);
 old_cycle:=coalesce((s.cycles->j.reservation_cycle::text->>j.request_id::text)::bigint,0);
 cost_value:=case when usage_data->'costMicro'='null'::jsonb then null else (usage_data->>'costMicro')::bigint end;
 if cost_value is null then charge:=old_day; cycle_charge:=old_cycle;
 elsif j.reservation_reused then charge:=greatest(old_day,cost_value); cycle_charge:=greatest(old_cycle,cost_value);
 else charge:=cost_value; cycle_charge:=cost_value; end if;
 if s.budget_day=j.reservation_day then
  update public.contacts_enrichment_state set day_spent_micro=day_spent_micro-old_day+charge,
   day_requests=jsonb_set(day_requests,array[j.request_id::text],to_jsonb(charge)),
   cycles=jsonb_set(cycles,array[j.reservation_cycle::text,j.request_id::text],to_jsonb(cycle_charge)) where singleton;
 end if;
 update public.contacts_enrichment_jobs set status='completed',outcome=outcome_value,reason=reason_value,
  contact_id=saved_contact_id,contact_operation=operation,usage_provider=usage_data->>'provider',usage_call_id=usage_data->>'callId',
  usage_cost_micro=cost_value,cost_overrun=coalesce(cost_value>reserved_micro,false),completed_at=clock_timestamp() where id=j.id;
 update public.contacts_enrichment_state set lease_job_id=null,lease_cache_id=null,lease_token=null,lease_expires_at=null where singleton;
 return jsonb_build_object('status','ready','receipt',public._gmail_enrichment_receipt(j.id));
end $$;

create function public.gmail_enrichment_defer(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare locked jsonb; j public.contacts_enrichment_jobs%rowtype; reason_value text:=p_payload->>'reason';
begin
 if jsonb_typeof(p_payload->'reason') is distinct from 'string' or reason_value not in ('aborted','unavailable','forbidden','invalid_response','response_too_large','rate_limited',
  'budget_exceeded','log_unavailable','schema_not_ready','write_outcome_unknown','invalid_email','unsupported_raw','raw_too_large','lease_lost','cache_save_failed')
  or (p_payload?'uncertain' and jsonb_typeof(p_payload->'uncertain')<>'boolean') then return '{"status":"invalid_request"}'; end if;
 locked:=public._gmail_enrichment_lock(p_payload->'claim');
 if locked->>'status'<>'ready' then return locked; end if;
 select * into j from public.contacts_enrichment_jobs where id=(p_payload->'claim'->>'jobId')::uuid;
 update public.contacts_enrichment_jobs set status=case when reason_value in ('invalid_email','unsupported_raw','raw_too_large') or attempts>=5 then 'quarantined' else 'retry' end,
  reason=reason_value,uncertain=coalesce((p_payload->>'uncertain')::boolean,false),available_at=clock_timestamp()+interval '1 minute',version=version+1 where id=j.id;
 update public.contacts_enrichment_state set lease_job_id=null,lease_cache_id=null,lease_token=null,lease_expires_at=null where singleton;
 return '{"status":"ready"}';
end $$;

revoke all on function public._gmail_enrichment_email(text),public._gmail_enrichment_source_version(jsonb),public._gmail_enrichment_contact_id(text),
 public._gmail_enrichment_scope(jsonb),public._gmail_enrichment_time(text),public._gmail_enrichment_json_bytes(jsonb),
 public._gmail_enrichment_claim_json(uuid),public._gmail_enrichment_receipt(uuid),public._gmail_enrichment_lock(jsonb,boolean),
 public.gmail_enrichment_probe(jsonb),public.gmail_enrichment_claim(jsonb),public.gmail_enrichment_renew(jsonb),
 public.gmail_enrichment_complete(jsonb),public.gmail_enrichment_defer(jsonb) from public,anon,authenticated,service_role;
grant execute on function public._gmail_enrichment_email(text),public._gmail_enrichment_source_version(jsonb),public._gmail_enrichment_contact_id(text),
 public._gmail_enrichment_scope(jsonb),public._gmail_enrichment_time(text),public._gmail_enrichment_json_bytes(jsonb),
 public._gmail_enrichment_claim_json(uuid),public._gmail_enrichment_receipt(uuid),public._gmail_enrichment_lock(jsonb,boolean),
 public.gmail_enrichment_probe(jsonb),public.gmail_enrichment_claim(jsonb),public.gmail_enrichment_renew(jsonb),
 public.gmail_enrichment_complete(jsonb),public.gmail_enrichment_defer(jsonb) to service_role;
commit;
