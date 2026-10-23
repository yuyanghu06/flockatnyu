-- Temporary deferred work only, never a durable source archive or assistant knowledge.
begin;
create function public.agent_pending_task_sources(p_info jsonb)
returns uuid[] language plpgsql immutable security invoker set search_path='' as $$
declare ids uuid[];
begin
 if jsonb_typeof(p_info) is distinct from 'object' or jsonb_typeof(p_info->'sourceIds') is distinct from 'array'
  or jsonb_array_length(p_info->'sourceIds') not between 1 and 500
  or exists(select 1 from jsonb_array_elements(p_info->'sourceIds') v where jsonb_typeof(v) is distinct from 'string')
 then return null;end if;
 begin
  select array_agg(v::uuid) into ids from jsonb_array_elements_text(p_info->'sourceIds') v;
 exception when invalid_text_representation then return null;end;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then return null;end if;
 return ids;
end $$;
create table public.agent_pending_tasks (
 uuid uuid primary key,
 info jsonb not null check(octet_length(info::text)<=262144 and public.agent_pending_task_sources(info) is not null),
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 expires_at timestamptz not null default statement_timestamp()+interval '24 hours',
 check(updated_at>=created_at and expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
comment on table public.agent_pending_tasks is
 'Service-only temporary unresolved tasks, trusted original context and execution trail; maximum 24 hours. Summary/context never authorizes a source read/write. Scoped lease-fenced RPCs only.';
create index agent_pending_tasks_expiry_idx on public.agent_pending_tasks(expires_at);
alter table public.agent_pending_tasks enable row level security;
alter table public.agent_pending_tasks force row level security;
revoke all on table public.agent_pending_tasks from public,anon,authenticated,service_role;

create function public.agent_pending_task_valid_scope(p_ids uuid[])
returns boolean language sql immutable security invoker set search_path='' as $$
 select p_ids is not null and coalesce(array_ndims(p_ids),1)=1 and cardinality(p_ids)<=500
  and cardinality(p_ids)=(select count(distinct v) from unnest(p_ids) v)
$$;

create function public.agent_pending_task_prune()
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 -- Same ordering as all task RPCs and the queue: one runner lock serializes capacity/maintenance.
 perform 1 from public.agent_automation_state where key='runner' for update;
 delete from public.agent_pending_tasks where expires_at<=clock_timestamp();get diagnostics n=row_count;
 return jsonb_build_object('status','ready','pruned',n);
end $$;

create function public.agent_pending_task_list(p_token uuid,p_allowed_source_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb;tasks jsonb;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) then return jsonb_build_object('status','invalid_request');end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 delete from public.agent_pending_tasks where expires_at<=clock_timestamp();
 -- Empty scope is maintenance only: do not read any pending payload, even with a valid lease.
 if cardinality(p_allowed_source_ids)=0 then return jsonb_build_object('status','ready','tasks','[]'::jsonb);end if;
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at,t.uuid),'[]'::jsonb) into tasks
 from public.agent_pending_tasks t where public.agent_pending_task_sources(t.info)<@p_allowed_source_ids;
 return jsonb_build_object('status','ready','tasks',tasks);
end $$;

create function public.agent_pending_task_save(p_token uuid,p_allowed_source_ids uuid[],p_task_id uuid,p_info jsonb,
 p_expected_updated_at timestamptz default null,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb;sources uuid[];previous public.agent_pending_tasks;next_task public.agent_pending_tasks;stamp timestamptz;
begin
 sources:=public.agent_pending_task_sources(p_info);
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) or cardinality(p_allowed_source_ids)=0
  or p_task_id is null or sources is null or octet_length(p_info::text)>262144
 then return jsonb_build_object('status','invalid_request');end if;
 if not sources<@p_allowed_source_ids then return jsonb_build_object('status','forbidden');end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 stamp:=clock_timestamp();
 select * into previous from public.agent_pending_tasks where uuid=p_task_id for update;
 if found then
  if not public.agent_pending_task_sources(previous.info)<@p_allowed_source_ids then return jsonb_build_object('status','forbidden');end if;
  if previous.expires_at<=stamp then return jsonb_build_object('status','expired');end if;
  -- Retrying an identical stable-UUID creation does not advance its version or retention deadline.
  if p_expected_updated_at is null and previous.info=p_info and (p_expires_at is null or p_expires_at=previous.expires_at)
   then return jsonb_build_object('status','ready','task',to_jsonb(previous));end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from previous.updated_at
   then return jsonb_build_object('status','conflict');end if;
  -- Updates cannot erase a dependency on a previously captured source.
  if not public.agent_pending_task_sources(previous.info)<@sources then return jsonb_build_object('status','forbidden');end if;
  if p_expires_at is not null and (p_expires_at<=stamp or p_expires_at>previous.expires_at)
   then return jsonb_build_object('status','invalid_request');end if;
  update public.agent_pending_tasks set info=p_info,updated_at=greatest(stamp,previous.updated_at+interval '1 microsecond'),
   expires_at=coalesce(p_expires_at,previous.expires_at) where uuid=p_task_id returning * into next_task;
 else
  if p_expected_updated_at is not null then return jsonb_build_object('status','conflict');end if;
  if p_expires_at is not null and (p_expires_at<=stamp or p_expires_at>stamp+interval '24 hours')
   then return jsonb_build_object('status','invalid_request');end if;
  delete from public.agent_pending_tasks where expires_at<=stamp;
  if (select count(*) from public.agent_pending_tasks)>=200 then return jsonb_build_object('status','capacity');end if;
  insert into public.agent_pending_tasks(uuid,info,created_at,updated_at,expires_at)
   values(p_task_id,p_info,stamp,stamp,coalesce(p_expires_at,stamp+interval '24 hours')) returning * into next_task;
 end if;
 return jsonb_build_object('status','ready','task',to_jsonb(next_task));
end $$;

create function public.agent_pending_task_resolve(p_token uuid,p_allowed_source_ids uuid[],p_task_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare runner jsonb;previous public.agent_pending_tasks;
begin
 if not public.agent_pending_task_valid_scope(p_allowed_source_ids) or cardinality(p_allowed_source_ids)=0
  or p_task_id is null or p_expected_updated_at is null then return jsonb_build_object('status','invalid_request');end if;
 select data into runner from public.agent_automation_state where key='runner' for update;
 if p_token is null or runner->>'token' is distinct from p_token::text
  or not coalesce((runner->>'lease_until')::timestamptz>clock_timestamp(),false)
 then return jsonb_build_object('status','stale');end if;
 select * into previous from public.agent_pending_tasks where uuid=p_task_id for update;
 if not found then return jsonb_build_object('status','conflict');end if;
 if not public.agent_pending_task_sources(previous.info)<@p_allowed_source_ids then return jsonb_build_object('status','forbidden');end if;
 if previous.updated_at is distinct from p_expected_updated_at then return jsonb_build_object('status','conflict');end if;
 if previous.expires_at<=clock_timestamp() then return jsonb_build_object('status','expired');end if;
 delete from public.agent_pending_tasks where uuid=p_task_id;
 return jsonb_build_object('status','ready');
end $$;

revoke all on function public.agent_pending_task_sources(jsonb),public.agent_pending_task_valid_scope(uuid[]),
 public.agent_pending_task_prune(),public.agent_pending_task_list(uuid,uuid[]),
 public.agent_pending_task_save(uuid,uuid[],uuid,jsonb,timestamptz,timestamptz),
 public.agent_pending_task_resolve(uuid,uuid[],uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.agent_pending_task_prune(),public.agent_pending_task_list(uuid,uuid[]),
 public.agent_pending_task_save(uuid,uuid[],uuid,jsonb,timestamptz,timestamptz),
 public.agent_pending_task_resolve(uuid,uuid[],uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
