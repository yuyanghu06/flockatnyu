-- M28: retire only the 14 audited, empty raw/scratch/generic payload tables.
-- Keep source ACLs, all legacy summary/provenance/accounting rows and the live
-- summary pipeline. Earlier migrations are immutable. Run atomically: abort
-- rather than delete any record that arrived after the read-only assessment.
begin;

-- Freeze candidate writers before checking emptiness. No active summary worker
-- tables are locked here; their rows, vectors and receipts remain unchanged.
lock table public.discord_messages, public.discord_message_revisions,
 public.discord_sync_state, public.discord_memory_buckets,
 public.discord_memory_members, public.discord_summary_inputs,
 public.discord_summary_parts, public.discord_summary_part_coverage,
 public.discord_summary_part_children, public.knowledge_documents,
 public.knowledge_document_members, public.knowledge_chunks,
 public.knowledge_daily_summaries, public.knowledge_sync_state
 in access exclusive mode;

do $$
declare candidate text; has_rows boolean;
begin
 foreach candidate in array array[
  'discord_messages',
  'discord_message_revisions',
  'discord_sync_state',
  'discord_memory_buckets',
  'discord_memory_members',
  'discord_summary_inputs',
  'discord_summary_parts',
  'discord_summary_part_coverage',
  'discord_summary_part_children',
  'knowledge_documents',
  'knowledge_document_members',
  'knowledge_chunks',
  'knowledge_daily_summaries',
  'knowledge_sync_state'
 ] loop
  execute format('select exists(select 1 from public.%I)',candidate) into has_rows;
  if has_rows then
   raise check_violation using message='Retirement requires an empty table: '||candidate;
  end if;
 end loop;
 if exists(select 1 from public.discord_summary_jobs where status='running' and lease_expires_at>now()) then
  raise serialization_failure using message='Active legacy summary leases; retry after retirement';
 end if;
end $$;

-- These retained service-only RPCs keep their signatures and permission checks.
-- Backfill configuration remains useful to direct Discord summary scheduling;
-- there is no longer a durable raw cursor or memory grouping to invalidate.
CREATE OR REPLACE FUNCTION public.discord_configure_channel(p_member_id text, p_channel jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare sid uuid; existing public.discord_channels; result public.discord_channels; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id)
 then raise insufficient_privilege using message='Admin access denied'; end if;
 if p_channel->>'channel_id' !~ '^[0-9]{1,20}$' or p_channel->>'guild_id' !~ '^[0-9]{1,20}$'
 or length(trim(p_channel->>'title')) not between 1 and 300 or jsonb_typeof(p_channel->'enabled') is distinct from 'boolean'
 or (p_channel->>'backfill_from')::timestamptz > now()
 then raise check_violation using message='Invalid channel'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_channel->>'channel_id'));
 select * into existing from public.discord_channels where channel_id=p_channel->>'channel_id';
 sid:=coalesce((p_channel->>'source_id')::uuid,existing.source_id);
 if existing.source_id is not null and ((sid is distinct from existing.source_id) or existing.guild_id is distinct from p_channel->>'guild_id')
 then raise check_violation using message='Channel identity cannot change'; end if;
 if sid is null then
   insert into public.knowledge_sources(kind,external_id,title,original_url,status)
   values('discord',p_channel->>'channel_id',p_channel->>'title','https://discord.com/channels/'||(p_channel->>'guild_id')||'/'||(p_channel->>'channel_id'),case when (p_channel->>'enabled')::boolean then 'active' else 'disabled' end)
   on conflict(kind,external_id) do update set title=excluded.title returning id into sid;
 end if;
 if not exists(select 1 from public.knowledge_sources where id=sid and kind='discord' and external_id=p_channel->>'channel_id')
 then raise check_violation using message='Source identity mismatch'; end if;
 insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,backfill_from)
 values(sid,p_channel->>'channel_id',p_channel->>'guild_id',p_channel->>'title',(p_channel->>'enabled')::boolean,(p_channel->>'backfill_from')::timestamptz)
 on conflict(source_id) do update set title=excluded.title,enabled=excluded.enabled,backfill_from=excluded.backfill_from,updated_at=now()
 returning * into result;
 update public.knowledge_sources set title=result.title,status=case when result.enabled then 'active' else 'disabled' end,updated_at=now() where id=sid;
 -- Configuration deliberately grants no members. Separate explicit source ACLs
 -- must be provisioned by trusted operators before any member can retrieve.
 return to_jsonb(result);
end $function$;

CREATE OR REPLACE FUNCTION public.discord_configure_policy(p_member_id text, p_guild_id text, p_policy jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare old public.discord_guild_policies; result public.discord_guild_policies; categories text[]; channels text[]; begin
 if not exists(select 1 from public.discord_admin_members where member_id=p_member_id) then raise insufficient_privilege using message='Admin access denied'; end if;
 if p_guild_id !~ '^[0-9]{1,20}$' or jsonb_typeof(p_policy) is distinct from 'object'
 or jsonb_typeof(p_policy->'paused') is distinct from 'boolean' or jsonb_typeof(p_policy->'discovery_enabled') is distinct from 'boolean'
 or jsonb_typeof(p_policy->'excluded_category_ids') is distinct from 'array' or jsonb_typeof(p_policy->'excluded_channel_ids') is distinct from 'array'
 or jsonb_array_length(p_policy->'excluded_category_ids')>500 or jsonb_array_length(p_policy->'excluded_channel_ids')>500
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_category_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or exists(select 1 from jsonb_array_elements(p_policy->'excluded_channel_ids') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{1,20}$')
 or coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z')>now()
 then raise check_violation using message='Invalid policy'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('discord-policy:'||p_guild_id));
 select * into old from public.discord_guild_policies where guild_id=p_guild_id for update;
 if old.revision is distinct from p_expected_revision then raise serialization_failure using message='Stale policy'; end if;
 select coalesce(array_agg(distinct v),'{}') into categories from jsonb_array_elements_text(p_policy->'excluded_category_ids') v;
 select coalesce(array_agg(distinct v),'{}') into channels from jsonb_array_elements_text(p_policy->'excluded_channel_ids') v;
 insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,backfill_from)
 values(p_guild_id,coalesce(old.revision,0)+1,(p_policy->>'paused')::boolean,(p_policy->>'discovery_enabled')::boolean,categories,channels,coalesce((p_policy->>'backfill_from')::timestamptz,'2015-01-01T00:00:00Z'))
 on conflict(guild_id) do update set revision=excluded.revision,paused=excluded.paused,discovery_enabled=excluded.discovery_enabled,excluded_category_ids=excluded.excluded_category_ids,excluded_channel_ids=excluded.excluded_channel_ids,backfill_from=excluded.backfill_from,updated_at=now() returning * into result;
 update public.discord_channels set policy_revision=result.revision where guild_id=p_guild_id;
 update public.knowledge_sources s set status='disabled',updated_at=now() from public.discord_channels c where c.source_id=s.id and c.guild_id=p_guild_id;
 -- Revision/source invalidation requires fresh discovery before retrieval.
 return to_jsonb(result);
end $function$;

CREATE OR REPLACE FUNCTION public.discord_live_summary_retire_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare gid text;enabled boolean;begin
 if tg_table_name='discord_summary_results' then select guild_id into gid from public.discord_summary_jobs where id=new.job_id;
 else gid:=new.guild_id;end if;
 select summary_only into enabled from public.discord_live_summary_state where guild_id=gid for share;
 if enabled then
  if tg_table_name='discord_summary_jobs' then
   if new.status='running' then raise check_violation using message='Discord archive retired; use live summaries';end if;
  else raise check_violation using message='Discord archive retired; use live summaries';end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.discord_live_summary_cutover(p_guild_id text, p_expected_policy_revision bigint, p_delete_raw boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare p public.discord_guild_policies;begin
 select * into p from public.discord_guild_policies where guild_id=p_guild_id for share;
 if p.guild_id is null or p.revision is distinct from p_expected_policy_revision then raise serialization_failure using message='Stale policy';end if;
 perform pg_advisory_xact_lock(hashtext('discord-discovery:'||p_guild_id));perform pg_advisory_xact_lock(hashtext('discord-memory:'||p_guild_id));
 insert into public.discord_live_summary_state(guild_id) values(p_guild_id) on conflict do nothing;
 perform 1 from public.discord_live_summary_state where guild_id=p_guild_id for update;
 -- The legacy-job trigger takes the same state row lock before dispatch.
 if exists(select 1 from public.discord_summary_jobs where guild_id=p_guild_id and status='running' and lease_expires_at>now()) or exists(select 1 from public.discord_live_summary_jobs where guild_id=p_guild_id and status='running' and lease_expires_at>now()) then raise serialization_failure using message='Active summary leases';end if;
 update public.discord_live_summary_state set summary_only=true,transitioned_at=coalesce(transitioned_at,now()) where guild_id=p_guild_id;
 update public.discord_summary_jobs set status='stale',lease_token=null,lease_expires_at=null,updated_at=now() where guild_id=p_guild_id and status<>'succeeded';
 -- Raw storage has been retired globally after the zero-row precondition.
 -- Retain p_delete_raw and response keys for existing operator clients.
 return jsonb_build_object('summaryOnly',true,'deletedRawMessages',0,'remainingRawMessages',0);
end $function$;

CREATE OR REPLACE FUNCTION public.discord_live_summary_status(p_guild_id text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('summaryOnly',coalesce((select summary_only from public.discord_live_summary_state where guild_id=p_guild_id),false),
 'pendingJobs',(select count(*) from public.discord_live_summary_jobs where guild_id=p_guild_id and status<>'succeeded'),
 'summaries',(select count(*) from public.discord_live_summary_results r join public.discord_live_summary_jobs j on j.id=r.job_id where j.guild_id=p_guild_id),
 'legacySummaries',(select count(*) from public.discord_summary_results r join public.discord_summary_jobs j on j.id=r.job_id where j.guild_id=p_guild_id),
 'readyEmbeddings',(select count(*) from public.discord_summary_vectors v join public.discord_channels c on c.source_id=v.source_id where c.guild_id=p_guild_id and v.status='ready' and v.content_hash=encode(sha256(convert_to(public.discord_live_summary_envelope(v.summary_kind,v.summary_id)::text,'UTF8')),'hex')),
 'missingEmbeddings',(select count(*) from (select 'live' kind,r.id,r.source_id from public.discord_live_summary_results r union all select 'legacy',r.id,r.source_id from public.discord_summary_results r) all_s join public.discord_channels c on c.source_id=all_s.source_id left join public.discord_summary_vectors v on v.summary_kind=all_s.kind and v.summary_id=all_s.id where c.guild_id=p_guild_id and (v.id is null or v.status<>'ready' or v.content_hash is distinct from encode(sha256(convert_to(public.discord_live_summary_envelope(all_s.kind,all_s.id)::text,'UTF8')),'hex'))),
 'rawMessages',0);
$function$;

-- Retire raw-trigger execution before removing its helper. The retained
-- legacy job/result triggers still enforce summary_only dispatch/write denial.
drop trigger discord_summary_original_changed on public.discord_messages;

-- Explicit caller-before-callee retirement, including the discord_messages
-- composite-typed helper. No blanket dependency removal is permitted.
drop function public.discord_embedding_work(integer,text,text);
drop function public.discord_get_sync_state(uuid);
drop function public.discord_memory_list(text,uuid[],text,uuid,integer);
drop function public.discord_memory_page(text,uuid[],uuid,text,integer);
drop function public.discord_memory_period(timestamp with time zone,timestamp with time zone);
drop function public.discord_persist_page(uuid,jsonb,jsonb);
drop function public.discord_rebuild_memory(text,bigint,timestamp with time zone);
drop function public.discord_reset_archive(text,text,bigint);
drop function public.discord_save_embedding(text,text,text,text,extensions.vector);
drop function public.discord_search(text,uuid[],text,text[],text,text,timestamp with time zone,timestamp with time zone,text,extensions.vector,text,text,integer);
drop function public.discord_summary_begin_operation(text,bigint,text,text,text,numeric,integer,text,timestamp with time zone,text);
drop function public.discord_summary_claim_job(uuid,text,integer);
drop function public.discord_summary_commit_usage(uuid,text,jsonb);
drop function public.discord_summary_fail_job(uuid,uuid,text);
drop function public.discord_summary_finish_job(uuid,uuid,jsonb,jsonb,jsonb);
drop function public.discord_summary_get_inputs(uuid,uuid,integer,integer,integer);
drop function public.discord_summary_get_parts(uuid,uuid);
drop function public.discord_summary_get_pending_operation(text,text,text,text,text,timestamp with time zone);
drop function public.discord_summary_invalidate_message();
drop function public.discord_summary_manifest(text,text,timestamp with time zone);
drop function public.discord_summary_prepare_operation(uuid,integer);
drop function public.discord_summary_preview(text,text,text,text,text,timestamp with time zone);
drop function public.discord_summary_renew_job(uuid,uuid,integer);
drop function public.discord_summary_reserve_request(uuid,uuid,uuid,numeric,bigint,bigint);
drop function public.discord_summary_save_part(uuid,uuid,jsonb);
drop function public.knowledge_delete_document(text,uuid[],uuid,uuid);
drop function public.knowledge_get_document(text,uuid[],uuid);
drop function public.knowledge_search(text,uuid[],text,integer,text);
drop function public.knowledge_upsert_document(text,uuid[],jsonb);
drop function public.discord_strip_message_images(jsonb);
drop function public.discord_summary_current_fingerprint(uuid);
drop function public.discord_summary_get_operation(uuid);
drop function public.discord_summary_lock_job(uuid,uuid);
drop function public.discord_summary_period_manifest(text,text,timestamp with time zone,uuid,text,timestamp with time zone,timestamp with time zone);
drop function public.discord_summary_planning_queue(text,text,timestamp with time zone);
drop function public.discord_summary_queue_waits(text,text,timestamp with time zone,jsonb);
drop function public.discord_strip_components(jsonb,integer);
drop function public.discord_summary_input(public.discord_messages,text);
drop function public.discord_summary_verified_input(uuid);
drop function public.discord_summary_waiting_sources(text,text,timestamp with time zone);
drop function public.discord_summary_component_links(jsonb,integer);
drop function public.discord_summary_extra_text(jsonb,integer);

-- Children first. Parent receipts/results/jobs/certificates/ledger are kept.
drop table public.discord_summary_part_children;
drop table public.discord_summary_part_coverage;
drop table public.discord_summary_parts;
drop table public.discord_summary_inputs;
drop table public.discord_memory_members;
drop table public.discord_memory_buckets;
drop table public.discord_message_revisions;
drop table public.discord_messages;
drop table public.discord_sync_state;
drop table public.knowledge_document_members;
drop table public.knowledge_chunks;
drop table public.knowledge_documents;
drop table public.knowledge_daily_summaries;
drop table public.knowledge_sync_state;

-- Replacement preserves ACLs, but restate these contracts for auditability.
revoke all on function public.discord_configure_channel(text,jsonb),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_live_summary_retire_archive(),
 public.discord_live_summary_cutover(text,bigint,boolean),
 public.discord_live_summary_status(text) from public,anon,authenticated;
grant execute on function public.discord_configure_channel(text,jsonb),
 public.discord_configure_policy(text,text,jsonb,bigint),
 public.discord_live_summary_retire_archive(),
 public.discord_live_summary_cutover(text,bigint,boolean),
 public.discord_live_summary_status(text) to service_role;

commit;
