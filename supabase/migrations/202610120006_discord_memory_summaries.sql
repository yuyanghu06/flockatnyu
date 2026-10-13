-- Service-only, resumable weekly/monthly compaction. Verified publication and
-- source-scoped pruning share one transaction; no vectors or member grants.
alter table public.discord_messages add column channel_name text;
-- Populate only retained current-week raw, deriving older canonical names by source.
update public.discord_messages m set channel_name=c.title from public.discord_channels c where c.source_id=m.source_id and m.created_at>=date_trunc('week',now() at time zone 'America/New_York') at time zone 'America/New_York';
create table public.discord_summary_operations (
 id uuid primary key default gen_random_uuid(),guild_id text not null references public.discord_guild_policies(guild_id),policy_revision bigint not null,
 provider text not null check(length(provider) between 1 and 100),model text not null check(length(model) between 1 and 200),prompt_version text not null check(length(prompt_version) between 1 and 100),
 mode text not null check(mode in ('bootstrap','weekly','monthly')),as_of timestamptz not null,due_identity text not null,manifest_fingerprint text not null check(manifest_fingerprint ~ '^[0-9a-f]{64}$'),total_jobs integer not null check(total_jobs>=0),
 max_cost_usd numeric(14,8) not null check(max_cost_usd>0 and max_cost_usd<=5),max_requests integer not null check(max_requests between 1 and 10000),
 allocated_usd numeric(14,8) not null default 0 check(allocated_usd>=0),spent_usd numeric(14,8) not null default 0 check(spent_usd>=0),request_count integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(guild_id,policy_revision,provider,model,prompt_version,mode,due_identity,manifest_fingerprint),unique(id,guild_id)
);
create table public.discord_summary_jobs (
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.discord_channels(source_id) on delete cascade,guild_id text not null references public.discord_guild_policies(guild_id),channel_id text not null,channel_name text not null,
 tier text not null check(tier in ('weekly','monthly')),period_key text not null,period_start timestamptz not null,period_end timestamptz not null,
 input_record_count integer not null,represented_message_count bigint not null,raw_message_count bigint not null,summary_input_count integer not null,completed_lease_token uuid,input_fingerprint text not null check(input_fingerprint ~ '^[0-9a-f]{64}$'),message_count integer not null,segment_count integer not null,input_chars bigint not null,
 provider text not null,model text not null,prompt_version text not null,policy_revision bigint not null,
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','stale')),
 operation_id uuid references public.discord_summary_operations(id) on delete set null,lease_token uuid,lease_owner text,lease_expires_at timestamptz,lease_seconds integer not null default 300,
 attempts integer not null default 0,failure_count integer not null default 0,error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(source_id,tier,period_key,input_fingerprint,provider,model,prompt_version),unique(id,source_id),unique(id,guild_id)
);
create table public.discord_summary_operation_jobs (
 operation_id uuid not null,job_id uuid not null,guild_id text not null,ordinal integer not null,
 primary key(operation_id,job_id),unique(operation_id,ordinal),
 foreign key(operation_id,guild_id) references public.discord_summary_operations(id,guild_id) on delete cascade,
 foreign key(job_id,guild_id) references public.discord_summary_jobs(id,guild_id) on delete cascade
);
create table public.discord_summary_certificates (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique,source_id uuid not null,channel_name text not null,
 range_start timestamptz not null,range_end timestamptz not null,tier text not null check(tier in ('weekly','monthly')),period_key text not null,
 represented_message_count bigint not null,raw_message_count bigint not null,summary_input_count integer not null,input_record_count integer not null,
 coverage_digest text not null,input_fingerprint text not null,summary_hash text not null,dependencies jsonb not null default '[]',provider text not null,model text not null,prompt_version text not null,
 committed_at timestamptz not null default now(),check(range_start<range_end),unique(id,source_id),foreign key(job_id,source_id) references public.discord_summary_jobs(id,source_id) on delete cascade,foreign key(source_id) references public.discord_channels(source_id) on delete cascade
);
create table public.discord_compaction_ledger (
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.discord_channels(source_id) on delete cascade,certificate_id uuid not null,
 range_start timestamptz not null,range_end timestamptz not null,tier text not null check(tier in ('weekly','monthly')),period_key text not null,active boolean not null default true,
 represented_message_count bigint not null,coverage_digest text not null,closed_at timestamptz not null default now(),check(range_start<range_end),unique(certificate_id),
 foreign key(certificate_id,source_id) references public.discord_summary_certificates(id,source_id) on delete cascade
);
create index discord_compaction_source_ranges on public.discord_compaction_ledger(source_id,range_start,range_end) where active;
create table public.discord_summary_inputs (
 job_id uuid not null,input_id text not null,kind text not null check(kind in ('raw','verified_summary')),source_id uuid not null,ordinal integer not null,input_hash text not null,
 segment_count integer not null check(segment_count>0),input_chars integer not null,represented_message_count bigint not null,citation_message_ids text[] not null,
 raw_message_id text,certificate_id uuid,range_start timestamptz,range_end timestamptz,
 primary key(job_id,input_id),unique(job_id,ordinal),foreign key(job_id,source_id) references public.discord_summary_jobs(id,source_id) on delete cascade,
 foreign key(certificate_id,source_id) references public.discord_summary_certificates(id,source_id),
 check((kind='raw' and raw_message_id=input_id and certificate_id is null) or(kind='verified_summary' and raw_message_id is null and certificate_id is not null))
);
create table public.discord_summary_parts (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.discord_summary_jobs(id) on delete cascade,
 stage text not null check(stage in ('map','reduce')),ordinal integer not null check(ordinal>=0),input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),summary jsonb not null,
 created_at timestamptz not null default now(),unique(job_id,stage,ordinal),unique(id,job_id)
);
create table public.discord_summary_part_coverage (
 part_id uuid not null,job_id uuid not null,input_id text not null,kind text not null check(kind in ('raw','verified_summary')),segment_index integer not null check(segment_index>=0),segment_count integer not null,
 primary key(job_id,input_id,segment_index),
 foreign key(part_id,job_id) references public.discord_summary_parts(id,job_id) on delete cascade,
 foreign key(job_id,input_id) references public.discord_summary_inputs(job_id,input_id) on delete cascade
);
create table public.discord_summary_part_children (
 part_id uuid not null,child_part_id uuid not null,job_id uuid not null,primary key(part_id,child_part_id),check(part_id<>child_part_id),
 foreign key(part_id,job_id) references public.discord_summary_parts(id,job_id) on delete cascade,
 foreign key(child_part_id,job_id) references public.discord_summary_parts(id,job_id) on delete cascade
);
create table public.discord_summary_requests (
 id uuid primary key,operation_id uuid not null references public.discord_summary_operations(id) on delete cascade,job_id uuid not null references public.discord_summary_jobs(id) on delete cascade,
 lease_token uuid not null,max_cost_usd numeric(14,8) not null check(max_cost_usd>0),status text not null default 'reserved' check(status in ('reserved','succeeded','failed','unknown')),
 input_tokens bigint not null default 0,output_tokens bigint not null default 0,cached_input_tokens bigint not null default 0,actual_cost_usd numeric(14,8),
 created_at timestamptz not null default now(),completed_at timestamptz
);
create table public.discord_summary_results (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique,source_id uuid not null,certificate_id uuid not null,channel_name text not null,summary jsonb not null,citations jsonb not null,created_at timestamptz not null default now(),
 foreign key(job_id,source_id) references public.discord_summary_jobs(id,source_id) on delete cascade,foreign key(certificate_id,source_id) references public.discord_summary_certificates(id,source_id)
);
create index discord_summary_jobs_claim on public.discord_summary_jobs(status,lease_expires_at);
create index discord_summary_jobs_source_period on public.discord_summary_jobs(source_id,period_start,period_end);
create index discord_summary_requests_operation on public.discord_summary_requests(operation_id);
create index discord_summary_coverage_part on public.discord_summary_part_coverage(part_id);
create index discord_summary_children_child on public.discord_summary_part_children(child_part_id);
do $$ declare t text; begin
 foreach t in array array['discord_summary_certificates','discord_compaction_ledger','discord_summary_operations','discord_summary_jobs','discord_summary_operation_jobs','discord_summary_inputs','discord_summary_parts','discord_summary_part_coverage','discord_summary_part_children','discord_summary_requests','discord_summary_results'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on table public.%I to service_role',t);
 end loop;
end $$;

create function public.discord_summary_period_key(p_tier text,p_start timestamptz)
returns text language sql immutable security invoker set search_path='' as $$
 select p_tier||':'||to_char(p_start at time zone 'America/New_York',case when p_tier='monthly' then 'YYYY-MM' else 'YYYY-MM-DD' end);
$$;
create function public.discord_summary_extra_text(p_value jsonb,p_depth integer default 0)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare result text:='';item jsonb;field record;piece text;begin
 if p_depth>16 or p_value is null then return '';end if;
 if jsonb_typeof(p_value)='array' then
  for item in select jsonb_array_elements(p_value) loop piece:=public.discord_summary_extra_text(item,p_depth+1);if length(piece)>0 then result:=concat_ws(E'\n',nullif(result,''),piece);end if;end loop;
 elsif jsonb_typeof(p_value)='object' then
  for field in select key,value from jsonb_each(p_value) order by key loop
   if field.key=any(array['content','text','title','description','label','value','name','filename']) and jsonb_typeof(field.value)='string' then piece:=field.value#>>'{}';elsif jsonb_typeof(field.value) in ('array','object') then piece:=public.discord_summary_extra_text(field.value,p_depth+1);else piece:='';end if;
   if length(piece)>0 then result:=concat_ws(E'\n',nullif(result,''),piece);end if;
  end loop;
 end if;return result;
end $$;
create function public.discord_summary_component_links(p_value jsonb,p_depth integer default 0)
returns text[] language plpgsql immutable security invoker set search_path='' as $$
declare result text[]:='{}';item jsonb;field record;begin
 if p_depth>16 or p_value is null then return result;end if;
 if jsonb_typeof(p_value)='array' then
  for item in select jsonb_array_elements(p_value) loop result:=result||public.discord_summary_component_links(item,p_depth+1);end loop;
 elsif jsonb_typeof(p_value)='object' then
  for field in select key,value from jsonb_each(p_value) loop
   if field.key='url' and jsonb_typeof(field.value)='string' and field.value#>>'{}' ~ '^https?://' and length(field.value#>>'{}')<=4000 then result:=array_append(result,field.value#>>'{}');
   elsif jsonb_typeof(field.value) in ('array','object') then result:=result||public.discord_summary_component_links(field.value,p_depth+1);end if;
  end loop;
 end if;return result;
end $$;
create function public.discord_summary_input(p_message public.discord_messages,p_channel_name text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('messageId',p_message.message_id,'channelId',p_message.channel_id,'channelName',coalesce(p_channel_name,(select c.title from public.discord_channels c where c.source_id=p_message.source_id),p_message.channel_name),'createdAt',to_char(p_message.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'editedAt',case when p_message.edited_at is null then null else to_char(p_message.edited_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
 'authorId',p_message.author_id,'authorName',coalesce(p_message.payload->'author'->>'global_name',p_message.payload->'author'->>'username',p_message.author_id),
 'content',p_message.content,'textEvidence',concat_ws(E'\n',case when p_message.embedding_text is distinct from p_message.content then nullif(p_message.embedding_text,'') end,nullif(public.discord_summary_extra_text(p_message.payload-'author'-'mentions'-'content'),'')),'replyToMessageId',p_message.reply_to_message_id,
 'links',coalesce((select jsonb_agg(url order by url) from(select distinct url from(
  select match[1] url from regexp_matches(p_message.content,'https?://[^[:space:]<>]+','g') match
  union all select unnest(public.discord_summary_component_links(p_message.payload))
  union all select v->>'url' from jsonb_array_elements(case when jsonb_typeof(p_message.payload->'embeds')='array' then p_message.payload->'embeds' else '[]'::jsonb end) v
  union all select v->>'url' from jsonb_array_elements(case when jsonb_typeof(p_message.payload->'attachments')='array' then p_message.payload->'attachments' else '[]'::jsonb end) v
 ) links where url ~ '^https?://' and length(url)<=4000) valid),'[]'::jsonb));
$$;




create function public.discord_summary_lock_job(p_job_id uuid,p_lease_token uuid)
returns public.discord_summary_jobs language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;p public.discord_guild_policies;op public.discord_summary_operations;begin
 select * into j from public.discord_summary_jobs where id=p_job_id;
 select * into p from public.discord_guild_policies where guild_id=j.guild_id for share;
 if p.guild_id is null or p.paused or p.revision is distinct from j.policy_revision then raise serialization_failure using message='Stale policy';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||j.guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||j.guild_id));
 perform pg_advisory_xact_lock(hashtext(j.source_id::text));
 select * into op from public.discord_summary_operations where id=j.operation_id for update;
 select * into j from public.discord_summary_jobs where id=p_job_id for update;
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' and c.title=j.channel_name for share of c,s;
 if not found then raise serialization_failure using message='Inactive source';end if;
 if op.id is null or op.guild_id<>j.guild_id or op.policy_revision<>p.revision or j.policy_revision<>p.revision or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() or not public.discord_channel_allowed(j.guild_id,j.channel_id) then raise serialization_failure using message='Stale lease';end if;
 update public.discord_summary_jobs set lease_expires_at=now()+j.lease_seconds*interval '1 second',updated_at=now() where id=j.id returning * into j;
 return j;
end $$;
create function public.discord_summary_get_operation(p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;counts jsonb;begin
 select * into op from public.discord_summary_operations where id=p_operation_id;
 select * into p from public.discord_guild_policies where guild_id=op.guild_id for share;
 if op.id is null or p.paused or p.revision is distinct from op.policy_revision then raise serialization_failure using message='Stale operation';end if;
 select jsonb_build_object('succeeded',count(*) filter(where j.status='succeeded'),'pending',count(*) filter(where j.status='pending'),'running',count(*) filter(where j.status='running'),'failed',count(*) filter(where j.status='failed'),'stale',count(*) filter(where j.status='stale'),'complete',count(*) filter(where j.status='succeeded')=op.total_jobs) into counts from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=op.id;
 return to_jsonb(op)||counts;
end $$;
create function public.discord_summary_claim_job(p_operation_id uuid,p_owner_id text,p_lease_seconds integer default 300)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;j public.discord_summary_jobs;begin
 select * into op from public.discord_summary_operations where id=p_operation_id;
 select * into p from public.discord_guild_policies where guild_id=op.guild_id for share;
 if op.id is null or p.paused or p.revision is distinct from op.policy_revision then raise serialization_failure using message='Stale operation';end if;
 if p_owner_id is null or length(p_owner_id) not between 1 and 128 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise check_violation using message='Invalid lease';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||op.guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||op.guild_id));
 select * into op from public.discord_summary_operations where id=p_operation_id for update;
 -- A claim may finish already-cached parts without another paid request.
 -- Only reserve_request gates dispatch against the durable operation budget.
 select j1.* into j from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j1 on j1.id=oj.job_id
 where oj.operation_id=op.id and j1.policy_revision=p.revision and (j1.status in ('pending','failed') or j1.status='running' and j1.lease_expires_at<=now()) and j1.failure_count<10
 order by oj.ordinal for update of j1 skip locked limit 1;
 if j.id is null then return null;end if;
 perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' for share of c,s;
 if not found then update public.discord_summary_jobs set status='stale',lease_token=null,updated_at=now() where id=j.id;return jsonb_build_object('status','stale');end if;
 if not public.discord_channel_allowed(j.guild_id,j.channel_id) or public.discord_summary_current_fingerprint(j.id) is distinct from j.input_fingerprint then
  update public.discord_summary_jobs set status='stale',lease_token=null,updated_at=now() where id=j.id;return jsonb_build_object('status','stale');
 end if;
 update public.discord_summary_jobs set status='running',operation_id=op.id,lease_token=gen_random_uuid(),lease_owner=p_owner_id,lease_seconds=p_lease_seconds,lease_expires_at=now()+p_lease_seconds*interval '1 second',attempts=attempts+1,error_code=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.discord_summary_renew_job(p_job_id uuid,p_lease_token uuid,p_lease_seconds integer default 300)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 if p_lease_seconds not between 30 and 900 then raise check_violation using message='Invalid lease';end if;
 update public.discord_summary_jobs set lease_seconds=p_lease_seconds,lease_expires_at=now()+p_lease_seconds*interval '1 second' where id=j.id;return true;
end $$;

create function public.discord_summary_valid_summary(p_summary jsonb,p_allowed_ids text[])
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare field text;finding jsonb;mid jsonb;begin
 if jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text)>32768 or (select count(*) from jsonb_object_keys(p_summary))<>7 or not p_summary ?& array['overview','decisions','actions','events','people','resources','uncertainties'] then return false;end if;
 foreach field in array array['overview','decisions','actions','events','people','resources','uncertainties'] loop
  if jsonb_typeof(p_summary->field) is distinct from 'array' or jsonb_array_length(p_summary->field)>12 then return false;end if;
  for finding in select jsonb_array_elements(p_summary->field) loop
   if jsonb_typeof(finding) is distinct from 'object' or (select count(*) from jsonb_object_keys(finding))<>2 or jsonb_typeof(finding->'text') is distinct from 'string' or length(trim(finding->>'text')) not between 1 and 1200 or jsonb_typeof(finding->'messageIds') is distinct from 'array' or jsonb_array_length(finding->'messageIds') not between 1 and 12 then return false;end if;
   for mid in select jsonb_array_elements(finding->'messageIds') loop
    if jsonb_typeof(mid) is distinct from 'string' or mid#>>'{}' !~ '^[0-9]{1,20}$' or not coalesce(mid#>>'{}'=any(p_allowed_ids),false) then return false;end if;
   end loop;
  end loop;
 end loop;return true;
end $$;
create function public.discord_summary_citation_ids(p_summary jsonb)
returns text[] language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct mid),'{}') from jsonb_each(p_summary) field cross join lateral jsonb_array_elements(field.value) finding cross join lateral jsonb_array_elements_text(finding->'messageIds') mid;
$$;
alter table public.discord_summary_parts add column reservation_id uuid references public.discord_summary_requests(id) on delete cascade;

create function public.discord_summary_reserve_request(p_job_id uuid,p_lease_token uuid,p_reservation_id uuid,p_max_cost_usd numeric,p_input_tokens bigint default 0,p_output_tokens bigint default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;op public.discord_summary_operations;r public.discord_summary_requests;begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 if p_reservation_id is null or p_max_cost_usd is null or p_max_cost_usd<=0 or p_max_cost_usd>5 or p_input_tokens<0 or p_output_tokens<0 then raise check_violation using message='Invalid reservation';end if;
 select * into op from public.discord_summary_operations where id=j.operation_id for update;
 select * into r from public.discord_summary_requests where id=p_reservation_id;
 if r.id is not null then
  if r.job_id<>j.id or r.operation_id<>op.id or r.max_cost_usd<>p_max_cost_usd then raise check_violation using message='Reservation identity mismatch';end if;
  return to_jsonb(r)||jsonb_build_object('dispatch_allowed',false);
 end if;
 if op.request_count>=op.max_requests or op.allocated_usd+p_max_cost_usd>op.max_cost_usd then return jsonb_build_object('status','budget_exhausted','dispatch_allowed',false);end if;
 insert into public.discord_summary_requests(id,operation_id,job_id,lease_token,max_cost_usd,input_tokens,output_tokens) values(p_reservation_id,op.id,j.id,p_lease_token,p_max_cost_usd,coalesce(p_input_tokens,0),coalesce(p_output_tokens,0)) returning * into r;
 update public.discord_summary_operations set allocated_usd=allocated_usd+p_max_cost_usd,request_count=request_count+1,updated_at=now() where id=op.id;
 return to_jsonb(r)||jsonb_build_object('dispatch_allowed',true);
end $$;
create function public.discord_summary_commit_usage(p_reservation_id uuid,p_status text,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.discord_summary_requests;op public.discord_summary_operations;cost numeric;begin
 select * into r from public.discord_summary_requests where id=p_reservation_id;if r.id is null then return false;end if;
 select * into op from public.discord_summary_operations where id=r.operation_id for update;
 select * into r from public.discord_summary_requests where id=p_reservation_id for update;
 if r.status<>'reserved' then return true;end if;
 if p_status not in ('succeeded','failed','unknown') or jsonb_typeof(p_usage) is distinct from 'object' then raise check_violation using message='Invalid usage';end if;
 cost:=case when p_status='succeeded' then (p_usage->>'costUsd')::numeric else r.max_cost_usd end;
 if cost is null or cost<0 or cost>r.max_cost_usd or coalesce((p_usage->>'inputTokens')::bigint,0)<0 or coalesce((p_usage->>'outputTokens')::bigint,0)<0 or coalesce((p_usage->>'cachedInputTokens')::bigint,0)<0 then raise check_violation using message='Usage exceeds reserved bound';end if;
 update public.discord_summary_requests set status=p_status,input_tokens=coalesce((p_usage->>'inputTokens')::bigint,0),output_tokens=coalesce((p_usage->>'outputTokens')::bigint,0),cached_input_tokens=coalesce((p_usage->>'cachedInputTokens')::bigint,0),actual_cost_usd=case when p_status='succeeded' then cost else null end,completed_at=now() where id=r.id;
 -- Unknown/failed attempts retain their full worst-case allocation; retries must
 -- reserve a fresh request. Successful observed usage releases unused headroom.
 update public.discord_summary_operations set allocated_usd=allocated_usd-r.max_cost_usd+cost,spent_usd=spent_usd+cost,updated_at=now() where id=op.id;return true;
end $$;


create function public.discord_summary_fail_job(p_job_id uuid,p_lease_token uuid,p_code text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 update public.discord_summary_jobs set status='failed',lease_token=null,lease_expires_at=null,failure_count=failure_count+case when p_code in ('budget_exhausted','aborted') then 0 else 1 end,error_code=case when p_code in ('rate_limited','provider_unavailable','invalid_response','coverage_failed','budget_exhausted','aborted','summary_failed') then p_code else 'summary_failed' end,updated_at=now() where id=j.id;return true;
end $$;



-- Certificates describe verified processing, not a second copy of originals.
create function public.discord_summary_ledger_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.source_id::text));
 if new.active and exists(select 1 from public.discord_compaction_ledger l where l.source_id=new.source_id and l.active and l.id<>new.id and l.range_start<new.range_end and new.range_start<l.range_end) then raise check_violation using message='Overlapping compacted ranges';end if;return new;
end $$;
create trigger discord_compaction_disjoint before insert or update on public.discord_compaction_ledger for each row execute function public.discord_summary_ledger_guard();
create function public.discord_summary_verified_input(p_certificate_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('inputId','summary:'||c.id,'kind','verified_summary','rangeStart',c.range_start,'rangeEnd',c.range_end,'representedMessageCount',c.represented_message_count,
 'coverageDigest',c.coverage_digest,'channelName',(select ch.title from public.discord_channels ch where ch.source_id=c.source_id),'summary',r.summary,'citations',r.citations,'provider',c.provider,'model',c.model,'promptVersion',c.prompt_version,
 'certificate',jsonb_build_object('verified',true,'certificateId',c.id,'sourceId',c.source_id,'inputFingerprint',c.input_fingerprint,'representedMessageCount',c.represented_message_count,'summaryHash',c.summary_hash))
 from public.discord_summary_certificates c join public.discord_summary_results r on r.certificate_id=c.id join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active
 where c.id=p_certificate_id and c.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex');
$$;
create function public.discord_summary_manifest(p_guild_id text,p_mode text default 'bootstrap',p_as_of timestamptz default now())
returns table(source_id uuid,channel_id text,tier text,period_key text,period_start timestamptz,period_end timestamptz,input_fingerprint text,message_count integer,segment_count integer,input_chars bigint,input_record_count integer,represented_message_count bigint,raw_message_count bigint,summary_input_count integer,ready boolean,cached_job_id uuid,inputs jsonb)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select c.source_id,c.channel_id,c.title channel_name,c.backfill_from,st.last_success_at from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.status='active'
  left join public.discord_sync_state st on st.source_id=c.source_id where c.guild_id=p_guild_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
 ), bounds as (select date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' month_start,date_trunc('week',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' recent_from),
 raw_windows as (
  select distinct e.source_id,e.channel_id,case when m.created_at<b.month_start then 'monthly' else 'weekly' end tier,
  case when m.created_at<b.month_start then date_trunc('month',m.created_at at time zone 'America/New_York') at time zone 'America/New_York' else greatest(date_trunc('week',m.created_at at time zone 'America/New_York') at time zone 'America/New_York',b.month_start) end range_start,
  case when m.created_at<b.month_start then least((date_trunc('month',m.created_at at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from)
  else least((date_trunc('week',m.created_at at time zone 'America/New_York')+interval '7 days') at time zone 'America/New_York',b.recent_from) end range_end
  from eligible e join public.discord_messages m on m.source_id=e.source_id and m.guild_id=p_guild_id and m.channel_id=e.channel_id cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and m.created_at<b.month_start and m.created_at<b.recent_from)
  or (p_mode in ('bootstrap','weekly') and m.created_at>=b.month_start and m.created_at<b.recent_from)
 ), retained_windows as (
  select e.source_id,e.channel_id,case when l.range_end<=b.month_start then 'monthly' else 'weekly' end tier,
  case when l.range_end<=b.month_start then date_trunc('month',l.range_start at time zone 'America/New_York') at time zone 'America/New_York' else l.range_start end range_start,
  case when l.range_end<=b.month_start then least((date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York',b.recent_from) else l.range_end end range_end
  from eligible e join public.discord_compaction_ledger l on l.source_id=e.source_id and l.active cross join bounds b
  where (p_mode in ('bootstrap','monthly','weekly') and l.range_end<=b.month_start and l.range_start<b.recent_from
  and (p_mode='bootstrap' or l.tier='weekly' or l.range_end<(date_trunc('month',l.range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York'))
  or (p_mode in ('bootstrap','weekly') and l.tier='weekly' and l.range_start>=b.month_start and l.range_end<=b.recent_from)
 ), windows as (
  select source_id,channel_id,tier,range_start,max(range_end) range_end from(select * from raw_windows union all select * from retained_windows) w group by source_id,channel_id,tier,range_start
 ), cached as materialized (
  select w.*,j.id job_id from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.tier=w.tier and l.range_start=w.range_start and l.range_end=w.range_end
  join public.discord_summary_certificates cert on cert.id=l.certificate_id join public.discord_summary_jobs j on j.id=cert.job_id join public.discord_summary_results r on r.certificate_id=cert.id
  where cert.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex') and not exists(select 1 from public.discord_messages m where m.source_id=w.source_id and m.created_at>=w.range_start and m.created_at<w.range_end)
 ), records as materialized (
  select w.*,m.message_id input_id,'raw' kind,m.created_at ordered_at,1::bigint represented,array[m.message_id] citation_ids,m.message_id raw_id,null::uuid certificate_id,
   public.discord_summary_input(m,input_source.channel_name)||jsonb_build_object('inputId',m.message_id,'kind','raw','representedMessageCount',1,'citationMessageIds',jsonb_build_array(m.message_id)) canonical
  from windows w join eligible input_source on input_source.source_id=w.source_id join public.discord_messages m on m.source_id=w.source_id and m.guild_id=p_guild_id and m.channel_id=w.channel_id and m.created_at>=w.range_start and m.created_at<w.range_end
  where not exists(select 1 from cached c where c.source_id=w.source_id and c.tier=w.tier and c.range_start=w.range_start)
  union all
  select w.*,'summary:'||c.id,'verified_summary',c.range_start,c.represented_message_count,public.discord_summary_citation_ids(r.summary),null,c.id,public.discord_summary_verified_input(c.id)
  from windows w join public.discord_compaction_ledger l on l.source_id=w.source_id and l.active and l.range_start>=w.range_start and l.range_end<=w.range_end
  join public.discord_summary_certificates c on c.id=l.certificate_id join public.discord_summary_results r on r.certificate_id=c.id
  where not exists(select 1 from cached ca where ca.source_id=w.source_id and ca.tier=w.tier and ca.range_start=w.range_start)
 ), measured as (
  select r.*,encode(sha256(convert_to(r.canonical::text,'UTF8')),'hex') row_hash,greatest(1,(length(r.canonical::text)+7999)/8000) segments from records r
 -- Do not let an underestimated eligible-source join rerun this expensive
 -- canonical/digest/JSON aggregation once for every source on fresh statistics.
 ), manifests as materialized (
  select r.source_id,r.channel_id,r.tier,public.discord_summary_period_key(r.tier,r.range_start) period_key,r.range_start,r.range_end,
  encode(sha256(convert_to(string_agg(r.input_id||':'||r.row_hash,'|' order by r.ordered_at,r.input_id),'UTF8')),'hex') fingerprint,
  count(*)::integer record_count,sum(r.represented) represented,sum(r.segments)::integer segments,sum(length(r.canonical::text)) chars,
  count(*) filter(where r.kind='raw')::bigint raw_count,count(*) filter(where r.kind='verified_summary')::integer summary_count,
  jsonb_agg(jsonb_build_object('inputId',r.input_id,'kind',r.kind,'inputHash',r.row_hash,'segmentCount',r.segments,'inputChars',length(r.canonical::text),'representedMessageCount',r.represented,'citationMessageIds',to_jsonb(r.citation_ids),'rawMessageId',r.raw_id,'certificateId',r.certificate_id,'rangeStart',r.ordered_at,'rangeEnd',case when r.kind='verified_summary' then (r.canonical->>'rangeEnd')::timestamptz else r.ordered_at end) order by r.ordered_at,r.input_id) input_refs
  from measured r group by r.source_id,r.channel_id,r.tier,r.range_start,r.range_end
 ) select m.source_id,m.channel_id,m.tier,m.period_key,m.range_start,m.range_end,m.fingerprint,m.represented::integer,m.segments,m.chars,m.record_count,m.represented,m.raw_count,m.summary_count,
 coalesce(e.last_success_at>=m.range_end and e.backfill_from<=m.range_start,false),null::uuid,m.input_refs from manifests m join eligible e on e.source_id=m.source_id
 union all select c.source_id,c.channel_id,c.tier,j.period_key,c.range_start,c.range_end,j.input_fingerprint,j.message_count,j.segment_count,j.input_chars,j.input_record_count,j.represented_message_count,j.raw_message_count,j.summary_input_count,true,j.id,'[]'::jsonb from cached c join public.discord_summary_jobs j on j.id=c.job_id;
$$;
-- An empty, newly discovered source is still unknown until its collector has
-- scanned the planned boundary. Do not mistake absence of rows for completeness.
create function public.discord_summary_waiting_sources(p_guild_id text,p_mode text,p_as_of timestamptz)
returns setof uuid language sql stable security invoker set search_path='' as $$
 with boundary as(select case when p_mode='monthly' then least(date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York',date_trunc('week',p_as_of at time zone 'America/New_York') at time zone 'America/New_York') else date_trunc('week',p_as_of at time zone 'America/New_York') at time zone 'America/New_York' end range_end)
 select c.source_id from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.status='active'
 left join public.discord_sync_state st on st.source_id=c.source_id cross join boundary b
 where c.guild_id=p_guild_id and c.enabled and public.discord_channel_allowed(c.guild_id,c.channel_id)
 and (st.last_success_at is null or st.last_success_at<b.range_end);
$$;
create function public.discord_summary_preview(p_guild_id text,p_provider text,p_model text,p_prompt_version text,p_mode text default 'bootstrap',p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='60s' set work_mem='16MB' as $$
declare p public.discord_guild_policies;result jsonb;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused then raise serialization_failure using message='Stale policy';end if;
 if p_mode not in ('bootstrap','weekly','monthly') or p_as_of is null or p_as_of>now()+interval '5 minutes' then raise check_violation using message='Invalid retention mode';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 if not exists(select 1 from public.discord_discovery_state d where d.guild_id=p_guild_id and d.policy_revision=p.revision and d.state->>'phase'='complete') then
  return jsonb_build_object('guild_id',p_guild_id,'policy_revision',p.revision,'mode',p_mode,'as_of',p_as_of,'group_count',0,'message_count',0,'input_record_count',0,'segment_count',0,'input_chars',0,'cached_count',0,'waiting_source_count',(select count(*) from public.discord_channels c where c.guild_id=p_guild_id and c.enabled),'blocked_group_count',1,'discovery_pending',true);
 end if;
 with groups as materialized(select * from public.discord_summary_manifest(p_guild_id,p_mode,p_as_of)),waiting as materialized(
  select source_id from groups where not ready union select public.discord_summary_waiting_sources(p_guild_id,p_mode,p_as_of))
 select jsonb_build_object('guild_id',p_guild_id,'policy_revision',p.revision,'mode',p_mode,'as_of',p_as_of,'group_count',count(*) filter(where g.ready),'message_count',coalesce(sum(g.represented_message_count) filter(where g.ready),0),'input_record_count',coalesce(sum(g.input_record_count) filter(where g.ready),0),'segment_count',coalesce(sum(g.segment_count) filter(where g.ready),0),'input_chars',coalesce(sum(g.input_chars) filter(where g.ready),0),'cached_count',count(*) filter(where g.cached_job_id is not null),'waiting_source_count',(select count(*) from waiting),'blocked_group_count',count(*) filter(where not g.ready)+(select count(*) from waiting w where not exists(select 1 from groups blocked where blocked.source_id=w.source_id and not blocked.ready))) into result from groups g;return result;
end $$;
create function public.discord_summary_begin_operation(p_guild_id text,p_expected_revision bigint,p_provider text,p_model text,p_prompt_version text,p_max_cost_usd numeric default 5,p_max_requests integer default 10000,p_mode text default 'bootstrap',p_as_of timestamptz default now(),p_due_identity text default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='60s' set work_mem='16MB' as $$
declare p public.discord_guild_policies;manifest jsonb;fingerprint text;op public.discord_summary_operations;item jsonb;sid uuid;n integer:=0;waiting integer;blocked integer;due text;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused or p.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy';end if;
 if p_mode not in ('bootstrap','weekly','monthly') or p_as_of is null or p_as_of>now()+interval '5 minutes' or p_provider is null or length(p_provider) not between 1 and 100 or p_model is null or length(p_model) not between 1 and 200 or p_prompt_version is null or length(p_prompt_version) not between 1 and 100 or p_max_cost_usd is null or p_max_cost_usd<=0 or p_max_cost_usd>5 or p_max_requests is null or p_max_requests not between 1 and 10000 then raise check_violation using message='Invalid operation';end if;
 due:=coalesce(p_due_identity,p_mode||':'||p_as_of::text);if length(due)>200 then raise check_violation using message='Invalid due identity';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 if not exists(select 1 from public.discord_discovery_state d where d.guild_id=p_guild_id and d.policy_revision=p.revision and d.state->>'phase'='complete') then
  return jsonb_build_object('status','wait_for_sync','waiting_source_count',(select count(*) from public.discord_channels c where c.guild_id=p_guild_id and c.enabled),'blocked_group_count',1,'discovery_pending',true);
 end if;
 select coalesce(jsonb_agg(to_jsonb(g) order by g.source_id,g.tier,g.period_key),'[]'::jsonb),encode(sha256(convert_to(coalesce(string_agg(g.source_id::text||':'||g.tier||':'||g.period_key||':'||g.input_fingerprint,'|' order by g.source_id,g.tier,g.period_key),''),'UTF8')),'hex'),count(distinct g.source_id) filter(where not g.ready),count(*) filter(where not g.ready) into manifest,fingerprint,waiting,blocked from public.discord_summary_manifest(p_guild_id,p_mode,p_as_of) g;
 with groups as(select value from jsonb_array_elements(manifest)),waiting_sources as materialized(
  select (value->>'source_id')::uuid source_id from groups where not (value->>'ready')::boolean union select public.discord_summary_waiting_sources(p_guild_id,p_mode,p_as_of))
 select count(*),blocked+count(*) filter(where not exists(select 1 from groups g where (g.value->>'source_id')::uuid=w.source_id and not (g.value->>'ready')::boolean)) into waiting,blocked from waiting_sources w;
 if blocked>0 then return jsonb_build_object('status','wait_for_sync','waiting_source_count',waiting,'blocked_group_count',blocked);end if;
 insert into public.discord_summary_operations(guild_id,policy_revision,provider,model,prompt_version,mode,as_of,due_identity,manifest_fingerprint,total_jobs,max_cost_usd,max_requests)
 values(p_guild_id,p.revision,p_provider,p_model,p_prompt_version,p_mode,p_as_of,due,fingerprint,jsonb_array_length(manifest),p_max_cost_usd,p_max_requests)
 on conflict(guild_id,policy_revision,provider,model,prompt_version,mode,due_identity,manifest_fingerprint) do nothing;
 select * into op from public.discord_summary_operations where guild_id=p_guild_id and policy_revision=p.revision and provider=p_provider and model=p_model and prompt_version=p_prompt_version and mode=p_mode and due_identity=due and manifest_fingerprint=fingerprint for update;
 if exists(select 1 from public.discord_summary_operation_jobs where operation_id=op.id) then return to_jsonb(op);end if;
 for item in select jsonb_array_elements(manifest) loop
  if item->>'cached_job_id' is not null then sid:=(item->>'cached_job_id')::uuid;
  else
   insert into public.discord_summary_jobs(source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,input_fingerprint,message_count,segment_count,input_chars,input_record_count,represented_message_count,raw_message_count,summary_input_count,provider,model,prompt_version,policy_revision)
   values((item->>'source_id')::uuid,p_guild_id,item->>'channel_id',(select c.title from public.discord_channels c where c.source_id=(item->>'source_id')::uuid),item->>'tier',item->>'period_key',(item->>'period_start')::timestamptz,(item->>'period_end')::timestamptz,item->>'input_fingerprint',(item->>'message_count')::integer,(item->>'segment_count')::integer,(item->>'input_chars')::bigint,(item->>'input_record_count')::integer,(item->>'represented_message_count')::bigint,(item->>'raw_message_count')::bigint,(item->>'summary_input_count')::integer,p_provider,p_model,p_prompt_version,p.revision)
   on conflict(source_id,tier,period_key,input_fingerprint,provider,model,prompt_version) do update set policy_revision=excluded.policy_revision,status=case when discord_summary_jobs.status='stale' or discord_summary_jobs.policy_revision<>excluded.policy_revision then 'pending' else discord_summary_jobs.status end,updated_at=now() returning id into sid;
   insert into public.discord_summary_inputs(job_id,input_id,kind,source_id,ordinal,input_hash,segment_count,input_chars,represented_message_count,citation_message_ids,raw_message_id,certificate_id,range_start,range_end)
   select sid,v->>'inputId',v->>'kind',(item->>'source_id')::uuid,ordinality::integer,v->>'inputHash',(v->>'segmentCount')::integer,(v->>'inputChars')::integer,(v->>'representedMessageCount')::bigint,array(select jsonb_array_elements_text(v->'citationMessageIds')),v->>'rawMessageId',(v->>'certificateId')::uuid,(v->>'rangeStart')::timestamptz,(v->>'rangeEnd')::timestamptz from jsonb_array_elements(item->'inputs') with ordinality vals(v,ordinality) on conflict(job_id,input_id) do nothing;
  end if;
  n:=n+1;insert into public.discord_summary_operation_jobs(operation_id,job_id,guild_id,ordinal) values(op.id,sid,p_guild_id,n);
 end loop;return to_jsonb(op);
end $$;
create function public.discord_summary_current_fingerprint(p_job_id uuid)
returns text language sql stable security invoker set search_path='' as $$
 with job as(select * from public.discord_summary_jobs where id=p_job_id),records as(
  select m.message_id input_id,m.created_at ordered_at,public.discord_summary_input(m,ch.title)||jsonb_build_object('inputId',m.message_id,'kind','raw','representedMessageCount',1,'citationMessageIds',jsonb_build_array(m.message_id)) canonical
  from job j join public.discord_channels ch on ch.source_id=j.source_id join public.discord_messages m on m.source_id=j.source_id and m.guild_id=j.guild_id and m.channel_id=j.channel_id and m.created_at>=j.period_start and m.created_at<j.period_end
  union all select 'summary:'||c.id,c.range_start,public.discord_summary_verified_input(c.id) from job j join public.discord_compaction_ledger l on l.source_id=j.source_id and l.active and l.range_start>=j.period_start and l.range_end<=j.period_end
  join public.discord_summary_certificates c on c.id=l.certificate_id
 ) select case when exists(select 1 from public.discord_summary_certificates where job_id=p_job_id) then (select input_fingerprint from job)
 else encode(sha256(convert_to(string_agg(input_id||':'||encode(sha256(convert_to(canonical::text,'UTF8')),'hex'),'|' order by ordered_at,input_id),'UTF8')),'hex') end from records;
$$;
create function public.discord_summary_get_inputs(p_job_id uuid,p_lease_token uuid,p_after integer default null,p_limit integer default 64,p_char_limit integer default 48000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;row record;canonical jsonb;txt text;segments jsonb;records jsonb:='[]';used integer:=0;last_ordinal integer:=coalesce(p_after,0);begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 if p_limit not between 1 and 64 or p_char_limit not between 8000 and 48000 or coalesce(p_after,0)<0 then raise check_violation using message='Invalid input page';end if;
 for row in select * from public.discord_summary_inputs where job_id=j.id and ordinal>coalesce(p_after,0) order by ordinal limit p_limit loop
  if row.kind='raw' then select public.discord_summary_input(m,j.channel_name)||jsonb_build_object('inputId',m.message_id,'kind','raw','representedMessageCount',1,'citationMessageIds',jsonb_build_array(m.message_id)) into canonical from public.discord_messages m where m.message_id=row.raw_message_id and m.source_id=j.source_id and m.guild_id=j.guild_id and m.channel_id=j.channel_id;
  else canonical:=public.discord_summary_verified_input(row.certificate_id);end if;
  txt:=canonical::text;if txt is null or encode(sha256(convert_to(txt,'UTF8')),'hex')<>row.input_hash then raise serialization_failure using message='Stale input';end if;
  if used>0 and used+length(txt)>p_char_limit then exit;end if;
  select jsonb_agg(jsonb_build_object('inputId',row.input_id,'kind',row.kind,'segmentIndex',n,'segmentCount',row.segment_count,'text',substring(txt from n*8000+1 for 8000)) order by n) into segments from generate_series(0,row.segment_count-1) n;
  records:=records||jsonb_build_array(canonical||jsonb_build_object('inputId',row.input_id,'kind',row.kind,'guildId',j.guild_id,'channelId',j.channel_id,'channelName',j.channel_name,'representedMessageCount',row.represented_message_count,'citationMessageIds',to_jsonb(row.citation_message_ids),'canonicalText',txt,'segments',segments));used:=used+length(txt);last_ordinal:=row.ordinal;
 end loop;
 return jsonb_build_object('records',records,'messages',records,'nextCursor',case when last_ordinal<j.input_record_count then last_ordinal else null end,'done',last_ordinal>=j.input_record_count);
end $$;
create function public.discord_summary_get_parts(p_job_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;result jsonb;begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 select coalesce(jsonb_agg(jsonb_build_object('partId',p.id,'stage',p.stage,'ordinal',p.ordinal,'inputHash',p.input_hash,'summary',p.summary,'reservationId',p.reservation_id,
 'coverage',coalesce((select jsonb_agg(jsonb_build_object('inputId',c.input_id,'kind',c.kind,'segmentIndex',c.segment_index,'segmentCount',c.segment_count) order by c.input_id,c.segment_index) from public.discord_summary_part_coverage c where c.part_id=p.id),'[]'),
 'childParts',coalesce((select jsonb_agg(jsonb_build_object('stage',child.stage,'ordinal',child.ordinal,'inputHash',child.input_hash) order by child.stage,child.ordinal) from public.discord_summary_part_children pc join public.discord_summary_parts child on child.id=pc.child_part_id where pc.part_id=p.id),'[]')) order by p.stage,p.ordinal),'[]') into result from public.discord_summary_parts p where p.job_id=j.id;return result;
end $$;
create function public.discord_summary_save_part(p_job_id uuid,p_lease_token uuid,p_part jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.discord_summary_jobs;existing public.discord_summary_parts;result public.discord_summary_parts;receipt public.discord_summary_requests;allowed text[];v jsonb;child public.discord_summary_parts;coverage jsonb;begin
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 if jsonb_typeof(p_part) is distinct from 'object' or p_part->>'stage' not in ('map','reduce') or p_part->>'ordinal' !~ '^[0-9]+$' or p_part->>'inputHash' !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_part->'coverage') is distinct from 'array' or jsonb_typeof(p_part->'childParts') is distinct from 'array' then raise check_violation using message='Invalid part';end if;
 select * into receipt from public.discord_summary_requests where id=(p_part->>'reservationId')::uuid and job_id=j.id and status='succeeded';
 if receipt.id is null then raise check_violation using message='Part requires successful reserved request';end if;
 if p_part->>'stage'='map' then
  if jsonb_array_length(p_part->'coverage') not between 1 and 256 or jsonb_array_length(p_part->'childParts')<>0 then raise check_violation using message='Invalid map coverage';end if;
  for v in select jsonb_array_elements(p_part->'coverage') loop
   if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>4 or v->>'segmentIndex' !~ '^[0-9]+$' or v->>'segmentCount' !~ '^[0-9]+$' or not exists(select 1 from public.discord_summary_inputs i where i.job_id=j.id and i.input_id=v->>'inputId' and i.kind=v->>'kind' and i.segment_count=(v->>'segmentCount')::integer and (v->>'segmentIndex')::integer<i.segment_count) then raise check_violation using message='Invalid segment coverage';end if;
  end loop;
  select array_agg(distinct mid) into allowed from jsonb_array_elements(p_part->'coverage') entry join public.discord_summary_inputs i on i.job_id=j.id and i.input_id=entry->>'inputId' cross join lateral unnest(i.citation_message_ids) mid;
 else
  if jsonb_array_length(p_part->'coverage')<>0 or jsonb_array_length(p_part->'childParts') not between 1 and 64 then raise check_violation using message='Invalid reduction';end if;
  for v in select jsonb_array_elements(p_part->'childParts') loop
   select * into child from public.discord_summary_parts where job_id=j.id and stage=v->>'stage' and ordinal=(v->>'ordinal')::integer and input_hash=v->>'inputHash';
   if child.id is null or child.stage='reduce' and child.ordinal>=(p_part->>'ordinal')::integer then raise check_violation using message='Invalid child provenance';end if;
   allowed:=coalesce(allowed,'{}')||public.discord_summary_citation_ids(child.summary);
  end loop;
 end if;
 if not public.discord_summary_valid_summary(p_part->'summary',allowed) then raise check_violation using message='Invalid summary citations';end if;
 select * into existing from public.discord_summary_parts where job_id=j.id and stage=p_part->>'stage' and ordinal=(p_part->>'ordinal')::integer;
 if existing.id is not null then
  if existing.input_hash is distinct from p_part->>'inputHash' or existing.summary is distinct from p_part->'summary' then raise serialization_failure using message='Part identity changed';end if;
  if existing.stage='map' and ((select count(*) from public.discord_summary_part_coverage c where c.part_id=existing.id)<>jsonb_array_length(p_part->'coverage')
   or exists(select 1 from jsonb_array_elements(p_part->'coverage') entry where not exists(select 1 from public.discord_summary_part_coverage c where c.part_id=existing.id and c.input_id=entry->>'inputId' and c.segment_index=(entry->>'segmentIndex')::integer and c.segment_count=(entry->>'segmentCount')::integer))) then raise serialization_failure using message='Part coverage changed';end if;
  if existing.stage='reduce' and ((select count(*) from public.discord_summary_part_children c where c.part_id=existing.id)<>jsonb_array_length(p_part->'childParts')
   or exists(select 1 from jsonb_array_elements(p_part->'childParts') entry where not exists(select 1 from public.discord_summary_part_children c join public.discord_summary_parts cp on cp.id=c.child_part_id where c.part_id=existing.id and cp.stage=entry->>'stage' and cp.ordinal=(entry->>'ordinal')::integer and cp.input_hash=entry->>'inputHash'))) then raise serialization_failure using message='Part provenance changed';end if;
  return jsonb_build_object('partId',existing.id,'stage',existing.stage,'ordinal',existing.ordinal,'inputHash',existing.input_hash,'summary',existing.summary);
 end if;
 insert into public.discord_summary_parts(job_id,stage,ordinal,input_hash,summary,reservation_id) values(j.id,p_part->>'stage',(p_part->>'ordinal')::integer,p_part->>'inputHash',p_part->'summary',receipt.id) returning * into result;
 if result.stage='map' then
  insert into public.discord_summary_part_coverage(part_id,job_id,input_id,kind,segment_index,segment_count) select result.id,j.id,entry->>'inputId',entry->>'kind',(entry->>'segmentIndex')::integer,(entry->>'segmentCount')::integer from jsonb_array_elements(p_part->'coverage') entry;
 else
  for v in select jsonb_array_elements(p_part->'childParts') loop
   select * into child from public.discord_summary_parts where job_id=j.id and stage=v->>'stage' and ordinal=(v->>'ordinal')::integer and input_hash=v->>'inputHash';insert into public.discord_summary_part_children(part_id,child_part_id,job_id) values(result.id,child.id,j.id);
  end loop;
 end if;
 update public.discord_summary_jobs set failure_count=0 where id=j.id;
 return jsonb_build_object('partId',result.id,'stage',result.stage,'ordinal',result.ordinal,'inputHash',result.input_hash,'summary',result.summary);
end $$;

create function public.discord_summary_finish_job(p_job_id uuid,p_lease_token uuid,p_summary jsonb,p_final_part jsonb,p_coverage jsonb)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='60s' set work_mem='16MB' as $$
declare j public.discord_summary_jobs;final_part public.discord_summary_parts;map_count integer;reachable integer;result public.discord_summary_results;cert public.discord_summary_certificates;citations jsonb;allowed text[];dependencies jsonb;affected uuid[];consumed uuid[];pruned bigint;begin
 select * into j from public.discord_summary_jobs where id=p_job_id;
 if j.status='succeeded' then
  perform 1 from public.discord_guild_policies where guild_id=j.guild_id for share;
  perform 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' for share of c,s;
  if not found then raise serialization_failure using message='Inactive source';end if;
  if j.completed_lease_token is distinct from p_lease_token or not public.discord_channel_allowed(j.guild_id,j.channel_id) then raise serialization_failure using message='Stale lease';end if;
  select * into cert from public.discord_summary_certificates where job_id=j.id;select * into result from public.discord_summary_results where certificate_id=cert.id;
  if result.id is not null and cert.summary_hash is distinct from encode(sha256(convert_to(result.summary::text,'UTF8')),'hex') then raise check_violation using message='Invalid certificate';end if;
  if cert.id is not null then return coalesce(to_jsonb(result),'{}')||jsonb_build_object('certificate_id',cert.id,'channel_id',j.channel_id,'channel_name',j.channel_name,'cached',true,'superseded',result.id is null,'represented_message_count',cert.represented_message_count);end if;
 end if;
 j:=public.discord_summary_lock_job(p_job_id,p_lease_token);
 if public.discord_summary_current_fingerprint(j.id) is distinct from j.input_fingerprint then raise serialization_failure using message='Stale fingerprint';end if;
 if (select count(*) from public.discord_summary_inputs where job_id=j.id)<>j.input_record_count or (select sum(represented_message_count) from public.discord_summary_inputs where job_id=j.id)<>j.represented_message_count or (select count(*) from public.discord_summary_part_coverage where job_id=j.id)<>j.segment_count then raise check_violation using message='Incomplete coverage';end if;
 if exists(select 1 from public.discord_summary_inputs i join public.discord_summary_certificates c on c.id=i.certificate_id where i.job_id=j.id and (c.source_id<>j.source_id or c.range_start<j.period_start or c.range_end>j.period_end or not exists(select 1 from public.discord_compaction_ledger l where l.certificate_id=c.id and l.active))) then raise serialization_failure using message='Stale dependency';end if;
 if exists(select 1 from public.discord_compaction_ledger l where l.source_id=j.source_id and l.active and l.range_start<j.period_end and j.period_start<l.range_end and not exists(select 1 from public.discord_summary_inputs i where i.job_id=j.id and i.certificate_id=l.certificate_id)) then raise check_violation using message='Unrepresented overlapping range';end if;
 if exists(select 1 from public.discord_summary_inputs i join public.discord_messages m on m.message_id=i.raw_message_id join public.discord_summary_inputs child on child.job_id=i.job_id and child.kind='verified_summary' where i.job_id=j.id and i.kind='raw' and m.created_at>=child.range_start and m.created_at<child.range_end) then raise check_violation using message='Overlapping raw and represented coverage';end if;
 select * into final_part from public.discord_summary_parts where job_id=j.id and stage=p_final_part->>'stage' and ordinal=(p_final_part->>'ordinal')::integer and input_hash=p_final_part->>'inputHash';
 if final_part.id is null or final_part.summary is distinct from (p_summary-'citations') then raise check_violation using message='Final part mismatch';end if;
 select count(*) into map_count from public.discord_summary_parts where job_id=j.id and stage='map';
 with recursive ancestors as(select final_part.id id union select c.child_part_id from public.discord_summary_part_children c join ancestors a on c.part_id=a.id where c.job_id=j.id)
 select count(*) filter(where p.stage='map') into reachable from ancestors a join public.discord_summary_parts p on p.id=a.id;
 if reachable<>map_count or p_coverage->>'inputFingerprint' is distinct from j.input_fingerprint or (p_coverage->>'inputRecordCount')::integer is distinct from j.input_record_count or (p_coverage->>'representedMessageCount')::bigint is distinct from j.represented_message_count or (p_coverage->>'segmentCount')::integer is distinct from j.segment_count or (p_coverage->>'mapPartCount')::integer is distinct from map_count then raise check_violation using message='Incomplete reduction coverage';end if;
 select array_agg(distinct mid) into allowed from public.discord_summary_inputs i cross join lateral unnest(i.citation_message_ids) mid where i.job_id=j.id;
 if not public.discord_summary_valid_summary(final_part.summary,allowed) then raise check_violation using message='Invalid summary citations';end if;
 select coalesce(jsonb_agg(jsonb_build_object('messageId',mid,'url','https://discord.com/channels/'||j.guild_id||'/'||j.channel_id||'/'||mid) order by mid::numeric),'[]') into citations from unnest(public.discord_summary_citation_ids(final_part.summary)) mid;
 select coalesce(jsonb_agg(jsonb_build_object('certificateId',c.id,'rangeStart',c.range_start,'rangeEnd',c.range_end,'representedMessageCount',c.represented_message_count,'coverageDigest',c.coverage_digest,'summaryHash',c.summary_hash) order by c.range_start),'[]'),array_agg(c.id) into dependencies,consumed from public.discord_summary_inputs i join public.discord_summary_certificates c on c.id=i.certificate_id where i.job_id=j.id;
 insert into public.discord_summary_certificates(job_id,source_id,channel_name,range_start,range_end,tier,period_key,represented_message_count,raw_message_count,summary_input_count,input_record_count,coverage_digest,input_fingerprint,summary_hash,dependencies,provider,model,prompt_version)
 values(j.id,j.source_id,j.channel_name,j.period_start,j.period_end,j.tier,j.period_key,j.represented_message_count,j.raw_message_count,j.summary_input_count,j.input_record_count,j.input_fingerprint,j.input_fingerprint,encode(sha256(convert_to(final_part.summary::text,'UTF8')),'hex'),dependencies,j.provider,j.model,j.prompt_version) returning * into cert;
 insert into public.discord_summary_results(job_id,source_id,certificate_id,channel_name,summary,citations) values(j.id,j.source_id,cert.id,j.channel_name,final_part.summary,citations) returning * into result;
 update public.discord_compaction_ledger set active=false where source_id=j.source_id and certificate_id=any(coalesce(consumed,'{}'));
 insert into public.discord_compaction_ledger(source_id,certificate_id,range_start,range_end,tier,period_key,represented_message_count,coverage_digest) values(j.source_id,cert.id,j.period_start,j.period_end,j.tier,j.period_key,j.represented_message_count,cert.coverage_digest);
 update public.discord_summary_jobs set status='succeeded',completed_lease_token=p_lease_token,lease_token=null,lease_expires_at=null,error_code=null,updated_at=now() where id=j.id;
 select array_agg(distinct mm.bucket_id) into affected from public.discord_memory_members mm join public.discord_summary_inputs i on i.raw_message_id=mm.message_id and i.source_id=mm.source_id where i.job_id=j.id and i.kind='raw';
 delete from public.discord_messages m using public.discord_summary_inputs i where i.job_id=j.id and i.kind='raw' and m.message_id=i.raw_message_id and m.source_id=j.source_id;get diagnostics pruned=row_count;
 if pruned<>j.raw_message_count then raise check_violation using message='Pruned coverage mismatch';end if;
 update public.discord_memory_buckets b set message_count=(select count(*) from public.discord_memory_members mm where mm.bucket_id=b.id) where b.id=any(coalesce(affected,'{}')) and exists(select 1 from public.discord_memory_members mm where mm.bucket_id=b.id);
 delete from public.discord_memory_buckets b where b.id=any(coalesce(affected,'{}')) and not exists(select 1 from public.discord_memory_members mm where mm.bucket_id=b.id);
 delete from public.discord_summary_results where certificate_id=any(coalesce(consumed,'{}'));
 -- Replacing any range invalidates unfinished overlapping manifests, including
 -- an earlier fingerprint of the same monthly job. Keep accounting, never old
 -- map/reduce content or references to originals that this commit consumed.
 delete from public.discord_summary_parts where job_id in(select prior.id from public.discord_summary_jobs prior where prior.source_id=j.source_id and prior.id<>j.id and prior.status<>'succeeded' and prior.period_start<j.period_end and j.period_start<prior.period_end);
 delete from public.discord_summary_inputs where job_id in(select prior.id from public.discord_summary_jobs prior where prior.source_id=j.source_id and prior.id<>j.id and prior.status<>'succeeded' and prior.period_start<j.period_end and j.period_start<prior.period_end);
 update public.discord_summary_jobs prior set status='stale',lease_token=null,lease_expires_at=null,error_code='superseded',updated_at=now() where prior.source_id=j.source_id and prior.id<>j.id and prior.status<>'succeeded' and prior.period_start<j.period_end and j.period_start<prior.period_end;
 delete from public.discord_summary_parts where job_id=j.id;delete from public.discord_summary_inputs where job_id=j.id;
 return to_jsonb(result)||jsonb_build_object('certificate_id',cert.id,'channel_id',j.channel_id,'channel_name',j.channel_name,'pruned_raw_count',pruned,'input_record_count',j.input_record_count,'represented_message_count',j.represented_message_count,'raw_message_count',j.raw_message_count,'summary_input_count',j.summary_input_count,'input_fingerprint',j.input_fingerprint);
end $$;
create function public.discord_summary_invalidate_message()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and public.discord_summary_input(old) is not distinct from public.discord_summary_input(new) then return null;end if;
 update public.discord_summary_jobs j set status='stale',lease_token=null,lease_expires_at=null,updated_at=now()
 where not exists(select 1 from public.discord_summary_certificates c where c.job_id=j.id) and
 ((TG_OP<>'INSERT' and j.source_id=old.source_id and old.created_at>=j.period_start and old.created_at<j.period_end) or(TG_OP<>'DELETE' and j.source_id=new.source_id and new.created_at>=j.period_start and new.created_at<j.period_end));return null;
end $$;
create trigger discord_summary_original_changed after insert or update or delete on public.discord_messages for each row execute function public.discord_summary_invalidate_message();
create function public.discord_summary_list_results(p_member_id text,p_allowed_source_ids uuid[],p_tier text default null,p_after uuid default null,p_limit integer default 10)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row record;result jsonb:='[]';begin
 if cardinality(p_allowed_source_ids) not between 1 and 100 or p_limit not between 1 and 20 or p_tier is not null and p_tier not in ('weekly','monthly') then return result;end if;
 perform 1 from public.discord_guild_policies p where p.guild_id in(select c.guild_id from public.discord_channels c where c.source_id=any(p_allowed_source_ids)) order by p.guild_id for share;
 for row in select r.id result_id,r.summary,r.citations,r.created_at result_created,cert.id certificate_id,cert.coverage_digest,cert.dependencies,j.* from public.discord_summary_results r
 join public.discord_summary_certificates cert on cert.id=r.certificate_id and cert.source_id=r.source_id join public.discord_compaction_ledger l on l.certificate_id=cert.id and l.active
 join public.discord_summary_jobs j on j.id=cert.job_id join public.discord_channels c on c.source_id=j.source_id and c.enabled join public.knowledge_sources s on s.id=j.source_id and s.status='active'
 join public.knowledge_source_members sm on sm.source_id=j.source_id and sm.member_id=p_member_id and sm.can_read
 where j.source_id=any(p_allowed_source_ids) and public.discord_channel_allowed(j.guild_id,j.channel_id) and (p_tier is null or j.tier=p_tier) and (p_after is null or r.id>p_after)
 and cert.summary_hash=encode(sha256(convert_to(r.summary::text,'UTF8')),'hex') order by r.id limit p_limit loop
  result:=result||jsonb_build_array(jsonb_build_object('summaryId',row.result_id,'jobId',row.id,'certificateId',row.certificate_id,'sourceId',row.source_id,'guildId',row.guild_id,'channelId',row.channel_id,'channelName',row.channel_name,'tier',row.tier,'periodKey',row.period_key,'periodStart',row.period_start,'periodEnd',row.period_end,'inputFingerprint',row.input_fingerprint,'inputRecordCount',row.input_record_count,'representedMessageCount',row.represented_message_count,'rawMessageCount',row.raw_message_count,'summaryInputCount',row.summary_input_count,'coverageDigest',row.coverage_digest,'dependencies',row.dependencies,'provider',row.provider,'model',row.model,'promptVersion',row.prompt_version,'summary',row.summary,'citations',row.citations,'createdAt',row.result_created));
 end loop;return result;
end $$;
create function public.discord_summary_get_pending_operation(p_guild_id text,p_provider text,p_model text,p_prompt_version text,p_mode text default null,p_as_of timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.discord_summary_operations;p public.discord_guild_policies;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;if p.guild_id is null or p.paused then raise serialization_failure using message='Stale policy';end if;
 select o.* into op from public.discord_summary_operations o where o.guild_id=p_guild_id and o.policy_revision=p.revision and o.provider=p_provider and o.model=p_model and o.prompt_version=p_prompt_version and (p_mode is null or o.mode=p_mode)
 and exists(select 1 from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=o.id and j.status in ('pending','running','failed') and j.failure_count<10 and public.discord_channel_allowed(j.guild_id,j.channel_id)
 and exists(select 1 from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id where c.source_id=j.source_id and c.guild_id=j.guild_id and c.channel_id=j.channel_id and c.enabled and s.status='active' and c.title=j.channel_name)
 and (j.tier='monthly' or j.period_start>=date_trunc('month',p_as_of at time zone 'America/New_York') at time zone 'America/New_York')
 and not exists(select 1 from public.discord_compaction_ledger l where l.source_id=j.source_id and l.active and l.tier='monthly' and l.range_start<=j.period_start and l.range_end>=j.period_end))
 order by case when o.mode='monthly' then 0 else 1 end,o.created_at limit 1;if op.id is null then return null;end if;return public.discord_summary_get_operation(op.id);
end $$;
create or replace function public.discord_persist_page(p_source_id uuid,p_messages jsonb,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.discord_channels; old public.discord_sync_state; m jsonb; previous public.discord_messages; policy public.discord_guild_policies; begin
 select * into c from public.discord_channels where source_id=p_source_id;
 select * into policy from public.discord_guild_policies where guild_id=c.guild_id for share;
 if policy.guild_id is not null and (policy.paused or policy.revision is distinct from (p_state->>'expected_policy_revision')::bigint or not public.discord_channel_allowed(c.guild_id,c.channel_id)) then return false; end if;
 if policy.guild_id is not null then
  select coalesce(jsonb_agg(public.discord_strip_message_images(v)),'[]'::jsonb) into p_messages from jsonb_array_elements(p_messages) v;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-memory:'||c.guild_id));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_id::text));
 select * into c from public.discord_channels where source_id=p_source_id and enabled;
 if c.source_id is null or not exists(select 1 from public.knowledge_sources where id=p_source_id and status='active')
 then raise insufficient_privilege using message='Channel disabled'; end if;
 select * into old from public.discord_sync_state where source_id=p_source_id for update;
 if old.before_cursor is distinct from p_state->>'expected_before' or old.window_to is distinct from (p_state->>'expected_window_to')::timestamptz
 or old.last_success_at is distinct from (p_state->>'expected_last_success_at')::timestamptz then return false; end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>100
 or p_state->>'status' not in ('running','succeeded') then raise check_violation using message='Invalid page'; end if;
 for m in select jsonb_array_elements(p_messages) loop
   if m->>'channel_id' is distinct from c.channel_id or m->>'guild_id' is distinct from c.guild_id
   or jsonb_typeof(m->'message_id') is distinct from 'string' or jsonb_typeof(m->'author_id') is distinct from 'string'
   or jsonb_typeof(m->'payload') is distinct from 'object' or m->'payload' ?| array['referenced_message','message_snapshots','resolved','thread']
   or m->'payload'->>'id' is distinct from m->>'message_id' or m->'payload'->>'channel_id' is distinct from c.channel_id
   or m->'payload'->'author'->>'id' is distinct from m->>'author_id'
   or m->'payload'->>'guild_id' is distinct from c.guild_id
   or m->>'url' is distinct from 'https://discord.com/channels/'||c.guild_id||'/'||c.channel_id||'/'||(m->>'message_id')
   then raise check_violation using message='Invalid message scope'; end if;
   select * into previous from public.discord_messages where message_id=m->>'message_id';
   if previous.source_id is not null and previous.source_id<>p_source_id then raise check_violation using message='Message identity mismatch'; end if;
   if previous.id is not null and (previous.author_id is distinct from m->>'author_id' or previous.created_at is distinct from (m->>'created_at')::timestamptz)
   then raise check_violation using message='Message identity mismatch'; end if;
   if exists(select 1 from public.discord_compaction_ledger l where l.source_id=p_source_id and l.active and (m->>'created_at')::timestamptz>=l.range_start and (m->>'created_at')::timestamptz<l.range_end) then continue;end if;
   if previous.id is not null and previous.payload is distinct from m->'payload' then
     insert into public.discord_message_revisions(message_id,payload,content_hash) values(previous.message_id,previous.payload,previous.content_hash);
   end if;
   insert into public.discord_messages(message_id,source_id,channel_id,channel_name,guild_id,author_id,created_at,edited_at,reply_to_message_id,content,embedding_text,payload,content_hash,url)
   values(m->>'message_id',p_source_id,c.channel_id,c.title,c.guild_id,m->>'author_id',(m->>'created_at')::timestamptz,(m->>'edited_at')::timestamptz,m->>'reply_to_message_id',m->>'content',m->>'embedding_text',m->'payload',m->>'content_hash',m->>'url')
   on conflict(message_id) do update set channel_name=excluded.channel_name,edited_at=excluded.edited_at,reply_to_message_id=excluded.reply_to_message_id,content=excluded.content,embedding_text=excluded.embedding_text,payload=excluded.payload,content_hash=excluded.content_hash,indexed_at=now(),
     embedding=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding else null end,
     embedding_model=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_model else null end,
     embedding_provider=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_provider else null end,
     embedding_hash=case when discord_messages.content_hash=excluded.content_hash then discord_messages.embedding_hash else null end;
 end loop;
 insert into public.discord_sync_state(source_id,last_success_at,window_from,window_to,before_cursor,status)
 values(p_source_id,(p_state->>'last_success_at')::timestamptz,(p_state->>'window_from')::timestamptz,(p_state->>'window_to')::timestamptz,p_state->>'before_cursor',p_state->>'status')
 on conflict(source_id) do update set last_success_at=excluded.last_success_at,window_from=excluded.window_from,window_to=excluded.window_to,before_cursor=excluded.before_cursor,status=excluded.status,last_attempt_at=now();
 return true;
end $$;



create or replace function public.discord_reset_archive(p_member_id text,p_guild_id text,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy public.discord_guild_policies; deleted bigint; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id) then raise insufficient_privilege using message='Admin access denied'; end if;
 select * into policy from public.discord_guild_policies where guild_id=p_guild_id for update;
 if policy.guild_id is null or not policy.paused or policy.revision is distinct from p_expected_revision then raise serialization_failure using message='Reset requires paused current policy'; end if;
 delete from public.discord_summary_jobs where guild_id=p_guild_id;
 delete from public.discord_summary_operations where guild_id=p_guild_id;
 delete from public.discord_memory_buckets b using public.discord_channels c where c.source_id=b.source_id and c.guild_id=p_guild_id;
 delete from public.discord_messages where guild_id=p_guild_id; get diagnostics deleted=row_count;
 delete from public.discord_sync_state st using public.discord_channels c where c.source_id=st.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_daily_summaries st using public.discord_channels c where c.source_id=st.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_documents d using public.discord_channels c where d.source_id=c.source_id and c.guild_id=p_guild_id;
 delete from public.knowledge_sync_state st using public.discord_channels c where st.source_id=c.source_id and c.guild_id=p_guild_id;
 delete from public.discord_discovery_state where guild_id=p_guild_id;
 update public.discord_guild_policies set revision=revision+1,updated_at=now() where guild_id=p_guild_id returning * into policy;
 update public.discord_channels set policy_revision=policy.revision where guild_id=p_guild_id;
 -- Operator, guild policy, exclusions, source ACLs and unrelated sources survive.
 return jsonb_build_object('deleted_messages',deleted,'guild_id',p_guild_id,'policy_revision',policy.revision);
end $$;



-- All retention helpers/RPCs remain invokers available to service_role only.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'discord_summary_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
