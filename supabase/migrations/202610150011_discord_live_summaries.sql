-- M25 additive, service-only live Discord summary store. No historical summary
-- or receipt is removed. Explicit cutover RPC locks ingestion before raw cleanup.
create table public.discord_live_summary_state (
 guild_id text primary key references public.discord_guild_policies(guild_id),
 summary_only boolean not null default false, transitioned_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.discord_live_summary_jobs (
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.discord_channels(source_id),guild_id text not null,channel_id text not null,channel_name text not null,
 tier text not null check(tier in ('weekly','monthly')),period_key text not null,period_start timestamptz not null,period_end timestamptz not null,
 provider text not null,model text not null,prompt_version text not null,policy_revision bigint not null,
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','stale')),
 lease_token uuid,lease_expires_at timestamptz,attempts integer not null default 0,allocated_usd numeric(14,8) not null default 0,request_count integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(period_start<period_end),
 unique(source_id,tier,period_key,provider,model,prompt_version)
);
create table public.discord_live_summary_results (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.discord_live_summary_jobs(id),source_id uuid not null references public.discord_channels(source_id),
 summary jsonb not null,citations jsonb not null,message_count bigint not null check(message_count>=0),input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 page_count integer not null check(page_count>0),input_bytes bigint not null check(input_bytes>=0),empty_period boolean not null,created_at timestamptz not null default now(),
 check(empty_period=(message_count=0))
);
create table public.discord_live_summary_runs (
 id uuid primary key default gen_random_uuid(),guild_id text not null references public.discord_guild_policies(guild_id),max_cost_usd numeric(14,8) not null check(max_cost_usd>0 and max_cost_usd<=1),
 max_requests integer not null check(max_requests between 1 and 1000),allocated_usd numeric(14,8) not null default 0,request_count integer not null default 0,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '1 hour'
);
create table public.discord_summary_vectors (
 id uuid primary key default gen_random_uuid(),summary_kind text not null check(summary_kind in ('legacy','live')),summary_id uuid not null,source_id uuid not null references public.discord_channels(source_id),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),embedding extensions.vector(1536),provider text not null default 'openai-compatible',model text not null default 'text-embedding-3-small',
 status text not null default 'pending' check(status in ('pending','running','ready')),lease_token uuid,lease_expires_at timestamptz,attempts integer not null default 0,
 allocated_usd numeric(14,8) not null default 0,request_count integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(summary_kind,summary_id),check((status='ready')=(embedding is not null))
);
create table public.discord_live_summary_requests (
 id uuid primary key,run_id uuid not null references public.discord_live_summary_runs(id),job_id uuid references public.discord_live_summary_jobs(id),vector_id uuid references public.discord_summary_vectors(id),
 max_cost_usd numeric(14,8) not null check(max_cost_usd>0),input_tokens bigint not null check(input_tokens>=0),output_tokens bigint not null check(output_tokens>=0),
 status text not null default 'reserved' check(status in ('reserved','succeeded','unknown')),actual_cost_usd numeric(14,8),usage jsonb,created_at timestamptz not null default now(),completed_at timestamptz,
 check((job_id is null)<>(vector_id is null))
);
create index discord_live_summary_jobs_pending on public.discord_live_summary_jobs(guild_id,status,period_end);
create index discord_summary_vectors_pending on public.discord_summary_vectors(status,lease_expires_at);
create index discord_live_summary_requests_run on public.discord_live_summary_requests(run_id);
do $$declare t text;begin
 foreach t in array array['discord_live_summary_state','discord_live_summary_jobs','discord_live_summary_results','discord_live_summary_runs','discord_summary_vectors','discord_live_summary_requests'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on table public.%I to service_role',t);
 end loop;
end $$;

-- Raw writes and old compaction dispatch cannot resume after cutover, including
-- an old image/CLI still deployed. New guilds remain opt-in until explicit cutover.
create function public.discord_live_summary_retire_archive() returns trigger language plpgsql security invoker set search_path='' as $$
declare gid text;enabled boolean;begin
 if tg_table_name='discord_summary_results' then select guild_id into gid from public.discord_summary_jobs where id=new.job_id;
 elsif tg_table_name='discord_message_revisions' then select guild_id into gid from public.discord_messages where message_id=new.message_id;
 else gid:=new.guild_id;end if;
 select summary_only into enabled from public.discord_live_summary_state where guild_id=gid for share;
 if enabled then
  if tg_table_name='discord_summary_jobs' then
   if new.status='running' then raise check_violation using message='Discord archive retired; use live summaries';end if;
  else raise check_violation using message='Discord archive retired; use live summaries';end if;
 end if;
 return new;
end $$;
create trigger discord_raw_retired before insert or update on public.discord_messages for each row execute function public.discord_live_summary_retire_archive();
create trigger discord_revision_retired before insert or update on public.discord_message_revisions for each row execute function public.discord_live_summary_retire_archive();
create trigger discord_legacy_job_retired before insert or update on public.discord_summary_jobs for each row execute function public.discord_live_summary_retire_archive();
create trigger discord_legacy_result_retired before insert or update on public.discord_summary_results for each row execute function public.discord_live_summary_retire_archive();

create function public.discord_live_summary_cutover(p_guild_id text,p_expected_policy_revision bigint,p_delete_raw boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.discord_guild_policies;removed bigint:=0;remaining bigint;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;
 if p.guild_id is null or p.revision is distinct from p_expected_policy_revision then raise serialization_failure using message='Stale policy';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 insert into public.discord_live_summary_state(guild_id) values(p_guild_id) on conflict do nothing;
 perform 1 from public.discord_live_summary_state where guild_id=p_guild_id for update;
 -- The legacy-job trigger takes the same state row lock before dispatch.
 if exists(select 1 from public.discord_summary_jobs where guild_id=p_guild_id and status='running' and lease_expires_at>now()) or exists(select 1 from public.discord_live_summary_jobs where guild_id=p_guild_id and status='running' and lease_expires_at>now()) then raise serialization_failure using message='Active summary leases';end if;
 update public.discord_live_summary_state set summary_only=true,transitioned_at=coalesce(transitioned_at,now()) where guild_id=p_guild_id;
 update public.discord_summary_jobs set status='stale',lease_token=null,lease_expires_at=null,updated_at=now() where guild_id=p_guild_id and status<>'succeeded';
 if p_delete_raw then
  delete from public.discord_memory_buckets where source_id in(select source_id from public.discord_channels where guild_id=p_guild_id);
  delete from public.discord_messages where guild_id=p_guild_id;get diagnostics removed=row_count;
  delete from public.discord_sync_state where source_id in(select source_id from public.discord_channels where guild_id=p_guild_id);
  -- Remove copied Discord originals only; preserve sources, grants, summaries,
  -- certificates, citations, compaction ledger and ALL usage receipts. Legacy
  -- summary_inputs are ID/hash/count/range refs only (001-010 has no body or
  -- snapshot column); retain these provenance refs and derived summary_parts.
  delete from public.knowledge_documents where source_id in(select source_id from public.discord_channels where guild_id=p_guild_id);
  delete from public.knowledge_daily_summaries where source_id in(select source_id from public.discord_channels where guild_id=p_guild_id);
 end if;
 select count(*) into remaining from public.discord_messages where guild_id=p_guild_id;
 return jsonb_build_object('summaryOnly',true,'deletedRawMessages',removed,'remainingRawMessages',remaining);
end $$;

create function public.discord_live_summary_enabled(p_guild_id text,p_revision bigint default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.discord_live_summary_state st join public.discord_guild_policies p using(guild_id) where st.guild_id=p_guild_id and st.summary_only and not p.paused and (p_revision is null or p.revision=p_revision));
$$;
create function public.discord_live_summary_plan(p_guild_id text,p_as_of timestamptz,p_mode text,p_provider text,p_model text,p_prompt_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.discord_guild_policies;st public.discord_live_summary_state;t text;anchor timestamp;finish timestamp;cursor_start timestamp;cursor_end timestamp;inserted integer:=0;n integer;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;select * into st from public.discord_live_summary_state where guild_id=p_guild_id for share;
 if not public.discord_live_summary_enabled(p_guild_id) then raise serialization_failure using message='Cutover required or paused';end if;
 if p_mode not in ('scheduled','weekly','monthly') or p_as_of is null or p_as_of>now()+interval '5 minutes' or p_as_of<st.transitioned_at-interval '40 days' or p_provider<>'openai-compatible' or p_model<>'gpt-6-luna' or length(p_prompt_version) not between 1 and 200 then raise check_violation using message='Invalid live plan';end if;
 perform pg_advisory_xact_lock(hashtext('discord-live-plan:'||p_guild_id));
 foreach t in array case when p_mode='scheduled' then array['weekly','monthly'] else array[p_mode] end loop
  anchor:=case when t='weekly' then date_trunc('week',st.transitioned_at at time zone 'America/New_York')-interval '1 week' else date_trunc('month',st.transitioned_at at time zone 'America/New_York')-interval '1 month' end;
  finish:=date_trunc(case when t='weekly' then 'week' else 'month' end,p_as_of at time zone 'America/New_York');
  cursor_start:=anchor;
  while cursor_start<finish loop
   cursor_end:=cursor_start+case when t='weekly' then interval '1 week' else interval '1 month' end;
   insert into public.discord_live_summary_jobs(source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,provider,model,prompt_version,policy_revision)
   select c.source_id,c.guild_id,c.channel_id,c.title,t,public.discord_summary_period_key(t,cursor_start at time zone 'America/New_York'),cursor_start at time zone 'America/New_York',cursor_end at time zone 'America/New_York',p_provider,p_model,p_prompt_version,p.revision
   from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.guild_id=p_guild_id and c.enabled and s.status='active' and public.discord_channel_allowed(c.guild_id,c.channel_id)
   on conflict(source_id,tier,period_key,provider,model,prompt_version) do update set status='pending',policy_revision=excluded.policy_revision,channel_name=excluded.channel_name,lease_token=null,lease_expires_at=null
   where discord_live_summary_jobs.status<>'succeeded' and discord_live_summary_jobs.policy_revision<>excluded.policy_revision;
   get diagnostics n=row_count;inserted:=inserted+n;cursor_start:=cursor_end;
  end loop;
 end loop;
 return jsonb_build_object('planned',inserted);
end $$;
create function public.discord_live_summary_begin_run(p_guild_id text,p_max_cost_usd numeric,p_max_requests integer)
returns jsonb language plpgsql security invoker set search_path='' as $$declare r public.discord_live_summary_runs;begin
 if not public.discord_live_summary_enabled(p_guild_id) then raise serialization_failure using message='Cutover required or paused';end if;
 insert into public.discord_live_summary_runs(guild_id,max_cost_usd,max_requests) values(p_guild_id,p_max_cost_usd,p_max_requests) returning * into r;return to_jsonb(r);
end $$;
create function public.discord_live_summary_lock(p_job_id uuid,p_lease_token uuid)
returns public.discord_live_summary_jobs language plpgsql security invoker set search_path='' as $$
declare j public.discord_live_summary_jobs;p public.discord_guild_policies;begin
 select * into j from public.discord_live_summary_jobs where id=p_job_id;
 select * into p from public.discord_guild_policies where guild_id=j.guild_id for share;
 perform 1 from public.discord_live_summary_state where guild_id=j.guild_id and summary_only for share;if not found then raise serialization_failure using message='Retired lease';end if;
 select * into j from public.discord_live_summary_jobs where id=p_job_id for update;
 if j.id is null or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() or p.paused or p.revision is distinct from j.policy_revision or not public.discord_channel_allowed(j.guild_id,j.channel_id) then raise serialization_failure using message='Stale live lease';end if;
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' for share of c,s;
 if not found then raise serialization_failure using message='Inactive source';end if;
 update public.discord_live_summary_jobs set lease_expires_at=now()+interval '5 minutes',updated_at=now() where id=j.id returning * into j;return j;
end $$;
create function public.discord_live_summary_claim(p_guild_id text,p_provider text,p_model text,p_prompt_version text,p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path='' as $$declare j public.discord_live_summary_jobs;p public.discord_guild_policies;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;
 perform 1 from public.discord_live_summary_state where guild_id=p_guild_id and summary_only for share;
 if not found or p.paused then raise serialization_failure using message='Cutover required or paused';end if;
 if p_lease_seconds not between 30 and 900 then raise check_violation using message='Invalid lease';end if;
 select q.* into j from public.discord_live_summary_jobs q join public.discord_channels c on c.source_id=q.source_id and c.enabled join public.knowledge_sources s on s.id=q.source_id and s.status='active'
 where q.guild_id=p_guild_id and q.provider=p_provider and q.model=p_model and q.prompt_version=p_prompt_version and q.policy_revision=p.revision and q.period_end<=now() and public.discord_channel_allowed(q.guild_id,q.channel_id)
 and (q.status in ('pending','failed') or q.status='running' and q.lease_expires_at<=now()) and q.attempts<100 and q.allocated_usd<5 and q.request_count<10000
 order by q.attempts,q.period_end,q.tier,q.channel_id for update of q skip locked limit 1;
 if j.id is null then return null;end if;
 update public.discord_live_summary_jobs set status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+p_lease_seconds*interval '1 second',attempts=attempts+1,updated_at=now() where id=j.id returning * into j;return to_jsonb(j);
end $$;
create function public.discord_live_summary_renew(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$begin perform public.discord_live_summary_lock(p_job_id,p_lease_token);return true;end $$;
create function public.discord_live_summary_fail(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$begin
 update public.discord_live_summary_jobs set status='failed',lease_token=null,lease_expires_at=null,updated_at=now() where id=p_job_id and lease_token=p_lease_token and status='running';return found;
end $$;

-- Complete identity + period + seven-field JSON + original citations. This is
-- the only embedding input; no raw message or processing request is persisted.
create function public.discord_live_summary_envelope(p_kind text,p_summary_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('summaryKind','live','summaryId',r.id,'sourceId',r.source_id,'guildId',j.guild_id,'channelId',j.channel_id,'channelName',j.channel_name,'tier',j.tier,'periodKey',j.period_key,'periodStart',j.period_start,'periodEnd',j.period_end,'provider',j.provider,'model',j.model,'promptVersion',j.prompt_version,'summary',r.summary,'citations',r.citations)
 from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id where p_kind='live' and r.id=p_summary_id and j.status='succeeded'
 union all
 select jsonb_build_object('summaryKind','legacy','summaryId',r.id,'sourceId',r.source_id,'guildId',j.guild_id,'channelId',j.channel_id,'channelName',r.channel_name,'tier',j.tier,'periodKey',j.period_key,'periodStart',j.period_start,'periodEnd',j.period_end,'provider',j.provider,'model',j.model,'promptVersion',j.prompt_version,'summary',r.summary,'citations',r.citations)
 from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id join public.discord_summary_certificates c on c.id=r.certificate_id and c.source_id=r.source_id
 where p_kind='legacy' and r.id=p_summary_id and c.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex');
$$;
create function public.discord_live_summary_queue_embeddings(p_guild_id text,p_limit integer default 1000)
returns integer language plpgsql security invoker set search_path='' as $$declare row record;body jsonb;h text;n integer:=0;begin
 if p_limit not between 1 and 1000 then raise check_violation using message='Invalid embedding limit';end if;
 for row in
 select all_s.* from (select 'live' kind,r.id,r.source_id,j.guild_id from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id
 union all select 'legacy',r.id,r.source_id,j.guild_id from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id) all_s
 left join public.discord_summary_vectors v on v.summary_kind=all_s.kind and v.summary_id=all_s.id
 where all_s.guild_id=p_guild_id and (v.id is null or v.content_hash is distinct from encode(sha256(convert_to(public.discord_live_summary_envelope(all_s.kind,all_s.id)::text,'UTF8')),'hex'))
 order by all_s.kind,all_s.id limit p_limit loop
  body:=public.discord_live_summary_envelope(row.kind,row.id);if body is null then continue;end if;h:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
  insert into public.discord_summary_vectors(summary_kind,summary_id,source_id,content_hash) values(row.kind,row.id,row.source_id,h)
  on conflict(summary_kind,summary_id) do update set content_hash=excluded.content_hash,status='pending',embedding=null,lease_token=null,lease_expires_at=null,updated_at=now()
  where discord_summary_vectors.content_hash<>excluded.content_hash;n:=n+1;
 end loop;return n;
end $$;
create function public.discord_live_summary_finish(p_job_id uuid,p_lease_token uuid,p_summary jsonb,p_citations jsonb,p_coverage jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.discord_live_summary_jobs;r public.discord_live_summary_results;ids text[];entry jsonb;count_messages bigint;begin
 j:=public.discord_live_summary_lock(p_job_id,p_lease_token);
 if p_coverage->>'complete' is distinct from 'true' or p_coverage->>'inputHash' !~ '^[0-9a-f]{64}$' or (p_coverage->>'pages')::integer<1 or (p_coverage->>'inputBytes')::bigint<0 or jsonb_typeof(p_citations) is distinct from 'array' or jsonb_array_length(p_citations)>512 then raise check_violation using message='Incomplete coverage';end if;
 count_messages:=(p_coverage->>'messageCount')::bigint;if count_messages is null or count_messages<0 then raise check_violation using message='Invalid message count';end if;
 ids:=public.discord_summary_citation_ids(p_summary);
 if not public.discord_summary_valid_summary(p_summary,ids) then raise check_violation using message='Invalid summary';end if;
 if cardinality(ids)>count_messages or count_messages=0 and cardinality(ids)>0 then raise check_violation using message='Invalid citations';end if;
 if (select count(distinct value->>'messageId') from jsonb_array_elements(p_citations))<>cardinality(ids) or jsonb_array_length(p_citations)<>cardinality(ids) then raise check_violation using message='Citation coverage';end if;
 for entry in select jsonb_array_elements(p_citations) loop
 if not coalesce(entry->>'messageId'=any(ids),false) or entry->>'url' is distinct from 'https://discord.com/channels/'||j.guild_id||'/'||j.channel_id||'/'||(entry->>'messageId') or jsonb_typeof(entry) is distinct from 'object' or (select count(*) from jsonb_object_keys(entry))<>2 then raise check_violation using message='Foreign citation';end if;
 end loop;
 update public.discord_live_summary_jobs set status='succeeded',lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id;
 insert into public.discord_live_summary_results(job_id,source_id,summary,citations,message_count,input_hash,page_count,input_bytes,empty_period)
 values(j.id,j.source_id,p_summary,p_citations,count_messages,p_coverage->>'inputHash',(p_coverage->>'pages')::integer,(p_coverage->>'inputBytes')::bigint,count_messages=0) returning * into r;
 insert into public.discord_summary_vectors(summary_kind,summary_id,source_id,content_hash) values('live',r.id,r.source_id,encode(sha256(convert_to(public.discord_live_summary_envelope('live',r.id)::text,'UTF8')),'hex'));
 return jsonb_build_object('summaryId',r.id,'emptyPeriod',r.empty_period);
end $$;

create function public.discord_live_summary_claim_embedding(p_guild_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$declare v public.discord_summary_vectors;body jsonb;begin
 perform 1 from public.discord_guild_policies where guild_id=p_guild_id and not paused for share;if not found then raise serialization_failure using message='Paused';end if;
 select q.* into v from public.discord_summary_vectors q join public.discord_channels c on c.source_id=q.source_id and c.enabled join public.knowledge_sources s on s.id=q.source_id and s.status='active'
 where c.guild_id=p_guild_id and public.discord_channel_allowed(c.guild_id,c.channel_id) and (q.status='pending' or q.status='running' and q.lease_expires_at<=now()) and q.attempts<100 and q.allocated_usd<1
 order by q.attempts,q.created_at,q.id for update of q skip locked limit 1;
 if v.id is null then return null;end if;
 body:=public.discord_live_summary_envelope(v.summary_kind,v.summary_id);
 if body is null or v.content_hash is distinct from encode(sha256(convert_to(body::text,'UTF8')),'hex') then return null;end if;
 update public.discord_summary_vectors set status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() where id=v.id returning * into v;
 return to_jsonb(v)-'embedding'||jsonb_build_object('envelope',body);
end $$;
create function public.discord_live_summary_release_embedding(p_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$begin
 update public.discord_summary_vectors set status='pending',lease_token=null,lease_expires_at=null,updated_at=now() where id=p_id and lease_token=p_lease_token and status='running';return found;
end $$;
create function public.discord_live_summary_save_embedding(p_id uuid,p_lease_token uuid,p_content_hash text,p_vector extensions.vector(1536))
returns boolean language plpgsql security invoker set search_path='' as $$declare v public.discord_summary_vectors;c public.discord_channels;body jsonb;begin
 select * into v from public.discord_summary_vectors where id=p_id;select * into c from public.discord_channels where source_id=v.source_id;
 perform 1 from public.discord_guild_policies where guild_id=c.guild_id and not paused for share;if not found then return false;end if;
 select * into v from public.discord_summary_vectors where id=p_id for update;body:=public.discord_live_summary_envelope(v.summary_kind,v.summary_id);
 if v.status<>'running' or v.lease_token is distinct from p_lease_token or v.lease_expires_at<=now() or v.content_hash is distinct from p_content_hash or body is null or v.content_hash is distinct from encode(sha256(convert_to(body::text,'UTF8')),'hex') or not c.enabled or not public.discord_channel_allowed(c.guild_id,c.channel_id) or not exists(select 1 from public.knowledge_sources where id=c.source_id and status='active') or p_vector is null or extensions.vector_norm(p_vector)<=0 then return false;end if;
 update public.discord_summary_vectors set embedding=p_vector,status='ready',lease_token=null,lease_expires_at=null,updated_at=now() where id=p_id;return true;
end $$;

-- Reservation is charged BEFORE network dispatch. An uncertain call retains its
-- full reservation; retries never erase receipts. Both run and job/vector caps
-- are durable, atomic and shared by concurrent workers.
create function public.discord_live_summary_reserve(p_run_id uuid,p_reservation_id uuid,p_job_id uuid,p_lease_token uuid,p_vector_id uuid,p_vector_lease uuid,p_input_tokens bigint,p_output_tokens bigint,p_max_cost_usd numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.discord_live_summary_runs;j public.discord_live_summary_jobs;v public.discord_summary_vectors;gid text;p public.discord_guild_policies;begin
 if (p_job_id is null)=(p_vector_id is null) or p_max_cost_usd is null or p_max_cost_usd<=0 or p_input_tokens is null or p_input_tokens<0 or p_output_tokens is null or p_output_tokens<0 then raise check_violation using message='Invalid reservation';end if;
 select guild_id into gid from public.discord_live_summary_runs where id=p_run_id;
 select * into p from public.discord_guild_policies where guild_id=gid for share;
 if p.paused or p.guild_id is null then raise serialization_failure using message='Paused';end if;
 -- consistent target-then-run order with commit_usage
 if p_job_id is not null then
  j:=public.discord_live_summary_lock(p_job_id,p_lease_token);if j.guild_id<>gid then raise check_violation using message='Foreign run';end if;
  if j.allocated_usd+p_max_cost_usd>5 or j.request_count>=10000 then return jsonb_build_object('status','budget_exhausted','dispatchAllowed',false);end if;
 else
  select q.* into v from public.discord_summary_vectors q join public.discord_channels c on c.source_id=q.source_id join public.knowledge_sources s on s.id=q.source_id and s.status='active' where q.id=p_vector_id and c.guild_id=gid and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id) for update of q;
  if v.id is null or v.status<>'running' or v.lease_token is distinct from p_vector_lease or v.lease_expires_at<=now() or v.content_hash is distinct from encode(sha256(convert_to(public.discord_live_summary_envelope(v.summary_kind,v.summary_id)::text,'UTF8')),'hex') then raise serialization_failure using message='Stale embedding lease';end if;
  if v.allocated_usd+p_max_cost_usd>1 or v.request_count>=1000 then return jsonb_build_object('status','budget_exhausted','dispatchAllowed',false);end if;
 end if;
 select * into r from public.discord_live_summary_runs where id=p_run_id for update;
 if r.id is null or r.expires_at<=now() then raise serialization_failure using message='Expired run';end if;
 if exists(select 1 from public.discord_live_summary_requests where id=p_reservation_id) then return jsonb_build_object('status','reservation_failed','dispatchAllowed',false);end if;
 if r.allocated_usd+p_max_cost_usd>r.max_cost_usd or r.request_count>=r.max_requests then return jsonb_build_object('status','budget_exhausted','dispatchAllowed',false);end if;
 insert into public.discord_live_summary_requests(id,run_id,job_id,vector_id,max_cost_usd,input_tokens,output_tokens) values(p_reservation_id,p_run_id,p_job_id,p_vector_id,p_max_cost_usd,p_input_tokens,p_output_tokens);
 update public.discord_live_summary_runs set allocated_usd=allocated_usd+p_max_cost_usd,request_count=request_count+1 where id=r.id;
 if p_job_id is not null then update public.discord_live_summary_jobs set allocated_usd=allocated_usd+p_max_cost_usd,request_count=request_count+1 where id=j.id;
 else update public.discord_summary_vectors set allocated_usd=allocated_usd+p_max_cost_usd,request_count=request_count+1,lease_expires_at=now()+interval '5 minutes' where id=v.id;end if;
 return jsonb_build_object('dispatchAllowed',true);
end $$;
create function public.discord_live_summary_commit_usage(p_reservation_id uuid,p_status text,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.discord_live_summary_requests;actual numeric;refund numeric;begin
 select * into q from public.discord_live_summary_requests where id=p_reservation_id;
 if q.id is null or p_status not in ('succeeded','unknown') then return false;end if;
 if q.job_id is not null then perform 1 from public.discord_live_summary_jobs where id=q.job_id for update;else perform 1 from public.discord_summary_vectors where id=q.vector_id for update;end if;
 perform 1 from public.discord_live_summary_runs where id=q.run_id for update;
 select * into q from public.discord_live_summary_requests where id=p_reservation_id for update;
 if q.status<>'reserved' then return q.status=p_status;end if;
 if p_status='succeeded' then
  actual:=(p_usage->>'costUsd')::numeric;
  if actual is null or actual<0 or actual>q.max_cost_usd or (p_usage->>'inputTokens')::bigint is null or (p_usage->>'outputTokens')::bigint is null or (p_usage->>'inputTokens')::bigint not between 0 and q.input_tokens or (p_usage->>'outputTokens')::bigint not between 0 and q.output_tokens then return false;end if;
  refund:=q.max_cost_usd-actual;
  update public.discord_live_summary_runs set allocated_usd=allocated_usd-refund where id=q.run_id;
  if q.job_id is not null then update public.discord_live_summary_jobs set allocated_usd=allocated_usd-refund where id=q.job_id;else update public.discord_summary_vectors set allocated_usd=allocated_usd-refund where id=q.vector_id;end if;
 end if;
 update public.discord_live_summary_requests set status=p_status,actual_cost_usd=actual,usage=case when p_status='succeeded' then jsonb_build_object('inputTokens',(p_usage->>'inputTokens')::bigint,'outputTokens',(p_usage->>'outputTokens')::bigint,'costUsd',actual) else null end,completed_at=now() where id=q.id;return true;
end $$;

create function public.discord_live_summary_status(p_guild_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('summaryOnly',coalesce((select summary_only from public.discord_live_summary_state where guild_id=p_guild_id),false),
 'pendingJobs',(select count(*) from public.discord_live_summary_jobs where guild_id=p_guild_id and status<>'succeeded'),
 'summaries',(select count(*) from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id where j.guild_id=p_guild_id),
 'legacySummaries',(select count(*) from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id where j.guild_id=p_guild_id),
 'readyEmbeddings',(select count(*) from public.discord_summary_vectors v join public.discord_channels c on c.source_id=v.source_id where c.guild_id=p_guild_id and v.status='ready' and v.content_hash=encode(sha256(convert_to(public.discord_live_summary_envelope(v.summary_kind,v.summary_id)::text,'UTF8')),'hex')),
 'missingEmbeddings',(select count(*) from (select 'live' kind,r.id,r.source_id from public.discord_live_summary_results r union all select 'legacy',r.id,r.source_id from public.discord_summary_results r) all_s join public.discord_channels c on c.source_id=all_s.source_id left join public.discord_summary_vectors v on v.summary_kind=all_s.kind and v.summary_id=all_s.id where c.guild_id=p_guild_id and (v.id is null or v.status<>'ready' or v.content_hash is distinct from encode(sha256(convert_to(public.discord_live_summary_envelope(all_s.kind,all_s.id)::text,'UTF8')),'hex'))),
 'rawMessages',(select count(*) from public.discord_messages where guild_id=p_guild_id));
$$;

-- Fallback-only member retrieval: trusted request allowlist AND durable member
-- grants AND current source/policy gate. Semantic ranking uses summary vectors.
create function public.discord_live_summary_search(p_member_id text,p_allowed_source_ids uuid[],p_query text default '',p_channel_ids text[] default '{}',p_from timestamptz default null,p_to timestamptz default null,p_limit integer default 5,p_vector extensions.vector(1536) default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$declare result jsonb;begin
 if cardinality(p_allowed_source_ids) not between 1 and 500 or p_limit not between 1 and 8 or length(p_query)>500 or cardinality(p_channel_ids)>100 or p_from is not null and p_to is not null and p_from>=p_to then return '[]';end if;
 select coalesce(jsonb_agg(row.body order by row.score desc,row.period_end desc),'[]') into result from (
 select body,coalesce(case when p_vector is not null and v.status='ready' and v.content_hash=encode(sha256(convert_to(body::text,'UTF8')),'hex') then 1-(v.embedding operator(extensions.<=>) p_vector) end,ts_rank_cd(to_tsvector('english',(body->'summary')::text),plainto_tsquery('english',p_query))) score,j.period_end
 from (
 select 'live' kind,r.id,r.source_id,j.guild_id,j.channel_id,j.period_start,j.period_end from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id where j.status='succeeded'
 union all select 'legacy',r.id,r.source_id,j.guild_id,j.channel_id,j.period_start,j.period_end from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id
 ) j join public.discord_channels c on c.source_id=j.source_id and c.enabled join public.knowledge_sources s on s.id=j.source_id and s.status='active'
 join public.knowledge_source_members sm on sm.source_id=j.source_id and sm.member_id=p_member_id and sm.can_read
 cross join lateral (select public.discord_live_summary_envelope(j.kind,j.id) body) env
 left join public.discord_summary_vectors v on v.summary_kind=j.kind and v.summary_id=j.id
 where j.source_id=any(p_allowed_source_ids) and public.discord_channel_allowed(j.guild_id,j.channel_id) and body is not null
 and (cardinality(p_channel_ids)=0 or j.channel_id=any(p_channel_ids)) and (p_from is null or j.period_end>p_from) and (p_to is null or j.period_start<p_to)
 and (p_query='' or p_vector is not null or to_tsvector('english',(body->'summary')::text)@@plainto_tsquery('english',p_query))
 order by score desc,j.period_end desc limit p_limit
 ) row;return result;
end $$;
-- Function grants are explicit and confined to this migration's namespace.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'discord_live_summary_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
