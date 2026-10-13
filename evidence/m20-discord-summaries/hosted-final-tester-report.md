# M20 final hosted retention tester report

## Final pass: independent analysis of root-executed evidence

- **Milestone / role / scope:** M20 independent aggregate-only retention analysis for guild `1203562091500404776`. Tester owns only this report. No new live calls, production changes, credentials, model/Discord calls, deployments, broad tests or child agents.
- **Starting state / evidence inspected:** [root aggregate snapshot](hosted-final-root-audit-snapshot.json), [exact root SQL](hosted-final-root-readonly-audit.sql), [runtime reader proof](hosted-final-runtime-reader-proof.json), and the original attempted SELECT preserved below.
- **Execution attribution:** root executed the aggregate SQL using the existing authenticated Supabase CLI account/Management API with `SET TRANSACTION READ ONLY` (HTTP201). Root separately called the existing runtime permission-aware reader (HTTP200). This tester independently analyzed those files; **this tester did not execute successful hosted SQL or runtime calls**. The prior MCP authentication rejection remains recorded below.
- **Work performed / changed file:** read only the supplied metadata files; performed99 local artifact assertions, then updated only this report.
- **Decisions:** use October12–18 current New York calendar week, not the obsolete October5 frozen scope. Evaluate the root snapshot at `2026-10-12T23:56:06.534677Z`; separate reader observation at `2026-10-12T23:56:09.308Z`. Both remain within the refreshed week.

### Checks and observed results

Executed local command: `python3 - <<'PY'` with inline JSON validation and SQL comparison, exit0. Output:

```text
PASS: 99 metadata/artifact assertions; exact SQL adaptations verified; no live calls.
Snapshot UTC: 2026-10-12T23:56:06.534677+00:00 Reader UTC: 2026-10-12T23:56:09.308Z
```

The SQL comparison reconstructed root's query from the original tester SELECT, adding only `SET TRANSACTION READ ONLY`, replacing `get_operation` completion with planning/nonstale/link/succeeded counts, and moving the row-locking reader RPC to the separate runtime proof. The full strings matched after these documented substitutions; there were no other SQL changes. Root SQL is preserved in the linked file; the original is below.

| Check | Observed result |
|---|---|
| Calendar | New York October12; week startOctober12 04:00UTC matches scope |
| Original operation |695 linked /695 succeeded /695 planned;673monthly+22weekly; complete |
| Rollover operation |722 linked /722 succeeded /722 planned;673monthly+49weekly; complete |
| Original receipts / spend |2190 rows=counter;$4.029992 spent=allocated;0reserved/0unsettled |
| Rollover receipts / spend |55 rows=counter;$0.0800596 spent=allocated;0reserved/0unsettled |
| Caps | Both retain$5 and10000requests; both respected |
| Active retention |722results=722certificates=722ledgers;673monthly+49weekly |
| Conservation |108953represented+4distinct raw=108957baseline |
| Raw timing |0older/0outside current week/0covered raw |
| Ledger ranges |0overlap pairs/duplicate source-periods/ranges beyond week/monthly calendar-boundary mismatches |
| Certificate/result integrity |0hash, fingerprint, count, source or range mismatches |
| Names / IDs / citations |0trusted job/source name-ID mismatches;0citation-set or original-ID/source-URL mismatches |
| Retained raw integrity |0payload identity/content/timestamp/source-URL/hash mismatches |
| Cleanup |0inputs/parts/coverage/child links/raw revisions/orphan revisions |
| Images / vectors / generic bodies |0structured image residue/vector provenance/generic documents/chunks/daily summaries |
| Collection scope |216registered=216enabled=216succeeded checkpoints;0enabled/ledger sources disallowed; minimum watermark06:26:52.992UTC |
| Grants / table protection |0source/document memberships;28tables forceRLS;0RLS failures/browser privileges |
| Function protection |56restricted functions;0invoker/browser-execute/service-execute ACL failures |
| Actual runtime reader | Nonempty source, no source grant; HTTP200 with0results; no source bodies returned |

The99 assertions covered exact expected metadata values, all zero-failure fields, both operation counters/caps, current scope and the separate runtime reader proof. The SQL snapshot deliberately reports `ungranted_reader_results:null`; **the independent conclusion uses the separate HTTP200/zero-result proof**, not that null field.

### Findings, unavailable checks and verdict

**PASS — bounded independent analysis of root-executed hosted evidence.** No material mismatch found in the supplied snapshot or reader proof. The initial tester-owned live-execution attempt remains blocked by MCP authentication; this pass establishes an independent analysis of attributed root execution, not independently authenticated execution.

Remaining limits: this point-in-time audit cannot reconstruct pruned original text, independently grade every model finding, establish causal absence of all historical image ingestion, prove future collector behavior, or establish scheduled summary cron execution (**unobserved**). Names/IDs, structural images and vectors were checked on retained records and normalized persisted metadata; prior consumed coverage is represented by sealed certificates and conserved counts. Member sign-in and end-to-end assistant retrieval are outside scope. The reader proof is a separate observation roughly three seconds after the SQL snapshot, not the same transaction.

- **Folder-guide updates needed:** none by this tester; ownership is only this report.
- **Handoff:** root may journal this bounded PASS with execution attribution and the remaining cron/retrieval limitations. No additional query, model call or retest is required by this pass.

## Earlier independent execution attempt — preserved history

- **Milestone / role / scope:** independent aggregate-only hosted retention verification, guild `1203562091500404776`. Exclusive ownership of this report; no production/config/schema/grant writes, credentials, deployments, source/model-output body dumps, model/Discord calls, broad retests or child agents.
- **Starting state inspected:** repository instructions, milestone/to-do, report template, applied001–010 definitions, accepted local reports and `hosted-execution-budget-proof.json`. Parent READY superseded the initial October5 frozen-week preparation.
- **Work / changed files:** checked the clock, inspected relevant SQL signatures locally, prepared and attempted exactly one Supabase aggregate SELECT, and replaced this report. No other file changed.
- **Decisions:** current America/New_York week October12–18,2026; start `2026-10-12T04:00:00Z`, end `2026-10-19T04:00:00Z`. Result/certificate name and channel-ID verification uses normalized job/source joins; those tables have no direct channel-ID column.

## Checks: commands and actual results

1. `clock__curr_time({})` returned `2026-10-12 18:13:43 UTC`, consistent with New York Monday October12 and the refreshed calendar scope.
2. Local read-only `rg` / `sed` inspection of relevant SQL definitions confirmed predicate and RPC signatures.
3. Exactly one `mcp__supabase__execute_sql({project_id:"jssehnrmqhstcrtxulpa",query:SELECT_BELOW})` attempt returned `isError:true` and:
   > MCP authentication required. Reconnect to continue using this server.

**Authentication rejected the call before SQL execution. No hosted audit snapshot, database counts or source/model-output bodies were returned.** No alternative credential access, cloud fallback, second database call, mutation or fault injection was attempted.

## Parent READY observations — attributed, not independently verified here

| Observation | Parent-provided value |
|---|---:|
| Post-daily original baseline |108957|
| Original operation `46219c71-4480-43e1-961d-a8f5844efbac` |695/695 complete;673 monthly+22 weekly;107067 represented;2190 requests;$4.029992|
| Rollover operation `0c20826c-2d5c-4eb9-a598-b3d5f4965571` |722/722 complete;695 aliases+27 new weekly;55 requests;$0.0800596|
| Active results |722:673 monthly+49 weekly|
| Active represented originals |108953|
| Retained raw / older raw |4 /0|
| Expected conservation |108953+4=108957|
| Both operation limits |$5 /10000 requests|
| Scheduled summary cron execution |Unobserved|

Parent also reported216completed collection sources and daily watermark `2026-10-12T06:26:52.992Z`. Collector/deployment behavior was not independently repeated by this tester.

## Findings / failures / unavailable checks

**Blocker:** Supabase MCP authentication is unavailable in this tester session.

The following checks remain **unexecuted**: terminal operation/job status and settled receipts; active-ledger/raw conservation, nonoverlap and no covered/older raw; certificate/result hashes, citation identities and authoritative names/IDs; consumed temporary inputs/parts/coverage cleanup and revisions; structured image sanitization/vector provenance; generic derived Discord documents/chunks/daily summaries; enabled-source scope/checkpoints; source/document grants; forced RLS/browser privileges/invoker ACLs; permission-aware reader returning zero for a valid ungranted principal on an actual nonempty result source.

The prepared SELECT below returns only metadata/counts/booleans. No predicate establishes production behavior because SQL did not execute.

## Acceptance verdict and remaining work

**BLOCKED / NOT VERIFIED.** The clock gate passed; independent final hosted retention acceptance did not execute. Parent completion observations remain separately attributed evidence, not this tester's PASS.

Restore existing MCP authentication and authorize one rerun of this aggregate snapshot, refreshing scope if the New York week changes. No production fixes are authorized by this test pass.

A successful snapshot would still not reconstruct deleted original text, grade every model finding, establish future collector behavior or prove scheduled summary cron execution. Member authentication and end-to-end assistant retrieval remain outside this pass.

- **Folder-guide updates needed:** none by this tester; only this report is assigned.
- **Handoff:** root was notified promptly of the exact authentication rejection; root owns journal integration and any renewed audit authorization.

## Exact attempted SELECT

```sql
with
scope as (select '1203562091500404776'::text guild_id,'2026-10-12T04:00:00Z'::timestamptz week_start,'2026-10-19T04:00:00Z'::timestamptz week_end,108957::bigint baseline),
sources as materialized (select c.* from public.discord_channels c join public.knowledge_sources s on s.id=c.source_id and s.kind='discord' join scope p on c.guild_id=p.guild_id),
raw as materialized (select m.* from public.discord_messages m join scope p on m.guild_id=p.guild_id),
jobs as materialized (select j.* from public.discord_summary_jobs j join scope p on j.guild_id=p.guild_id),
ledgers as materialized (select l.* from public.discord_compaction_ledger l join sources c using(source_id) where l.active),
results as materialized (select r.* from public.discord_summary_results r join sources c using(source_id)),
certs as materialized (select k.* from public.discord_summary_certificates k join sources c using(source_id)),
ops as materialized (select o.* from public.discord_summary_operations o where o.id in ('46219c71-4480-43e1-961d-a8f5844efbac'::uuid,'0c20826c-2d5c-4eb9-a598-b3d5f4965571'::uuid)),
reader as materialized (select gen_random_uuid()::text member_id),
reader_source as materialized (select source_id from results order by id limit 1),
tables as materialized (select c.oid,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (c.relname like 'knowledge_%' or c.relname like 'discord_%')),
functions as materialized (select p.oid,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'knowledge_%' or p.proname like 'discord_%'))
select jsonb_build_object(
 'snapshot',jsonb_build_object('utc',now(),'ny_date',to_char(now() at time zone 'America/New_York','YYYY-MM-DD'),'current_week_start',date_trunc('week',now() at time zone 'America/New_York') at time zone 'America/New_York','scope_week_matches',date_trunc('week',now() at time zone 'America/New_York') at time zone 'America/New_York'=(select week_start from scope)),
 'operations',(select jsonb_agg(jsonb_build_object('id',o.id,'planning_complete',o.planning_complete,'total_jobs',o.total_jobs,'linked_jobs',(select count(*) from public.discord_summary_operation_jobs x where x.operation_id=o.id),'linked_succeeded',(select count(*) from public.discord_summary_operation_jobs x join jobs j on j.id=x.job_id where x.operation_id=o.id and j.status='succeeded'),'linked_monthly',(select count(*) from public.discord_summary_operation_jobs x join jobs j on j.id=x.job_id where x.operation_id=o.id and j.tier='monthly'),'linked_weekly',(select count(*) from public.discord_summary_operation_jobs x join jobs j on j.id=x.job_id where x.operation_id=o.id and j.tier='weekly'),'complete',(public.discord_summary_get_operation(o.id)->>'complete')::boolean,'request_count',o.request_count,'request_rows',(select count(*) from public.discord_summary_requests q where q.operation_id=o.id),'reserved_requests',(select count(*) from public.discord_summary_requests q where q.operation_id=o.id and q.status='reserved'),'unsettled_receipts',(select count(*) from public.discord_summary_requests q where q.operation_id=o.id and q.completed_at is null),'spent_usd',o.spent_usd,'allocated_usd',o.allocated_usd,'max_cost_usd',o.max_cost_usd,'max_requests',o.max_requests,'caps_respected',o.spent_usd<=o.max_cost_usd and o.allocated_usd<=o.max_cost_usd and o.request_count<=o.max_requests) order by o.created_at) from ops o),
 'conservation',jsonb_build_object('baseline',(select baseline from scope),'raw',(select count(*) from raw),'raw_unique',(select count(distinct message_id) from raw),'older_raw',(select count(*) from raw,scope p where created_at<p.week_start),'outside_current_week_raw',(select count(*) from raw,scope p where created_at<p.week_start or created_at>=p.week_end),'active_ledgers',(select count(*) from ledgers),'represented',(select sum(represented_message_count) from ledgers),'conserved',(select sum(represented_message_count) from ledgers)+(select count(*) from raw)=(select baseline from scope),'results',(select count(*) from results),'certificates',(select count(*) from certs),'monthly',(select count(*) from ledgers where tier='monthly'),'weekly',(select count(*) from ledgers where tier='weekly'),'overlap_pairs',(select count(*) from ledgers a join ledgers b on a.source_id=b.source_id and a.id<b.id and a.range_start<b.range_end and b.range_start<a.range_end),'duplicate_source_periods',(select count(*) from (select source_id,period_key from ledgers group by source_id,period_key having count(*)>1) d),'covered_raw',(select count(*) from raw m where exists(select 1 from ledgers l where l.source_id=m.source_id and m.created_at>=l.range_start and m.created_at<l.range_end)),'range_beyond_week',(select count(*) from ledgers,scope p where range_end>p.week_start),'monthly_boundary_mismatch',(select count(*) from ledgers where tier='monthly' and (range_start is distinct from (date_trunc('month',range_start at time zone 'America/New_York') at time zone 'America/New_York') or range_end is distinct from ((date_trunc('month',range_start at time zone 'America/New_York')+interval '1 month') at time zone 'America/New_York')))),
 'consistency',jsonb_build_object(
 'active_certificate_result_mismatch',(select count(*) from ledgers l left join certs k on k.id=l.certificate_id left join jobs j on j.id=k.job_id left join results r on r.certificate_id=k.id where k.id is null or j.id is null or r.id is null or l.source_id<>k.source_id or r.source_id<>k.source_id or j.source_id<>k.source_id or r.job_id<>k.job_id or l.range_start<>k.range_start or l.range_end<>k.range_end or l.tier<>k.tier or l.period_key<>k.period_key or l.represented_message_count<>k.represented_message_count or l.coverage_digest<>k.coverage_digest or k.input_fingerprint<>j.input_fingerprint or k.range_start<>j.period_start or k.range_end<>j.period_end or k.represented_message_count<>j.represented_message_count or k.summary_hash<>encode(sha256(convert_to(r.summary::text,'UTF8')),'hex')),
 'name_identity_mismatch',(select count(*) from results r join certs k on k.id=r.certificate_id join jobs j on j.id=r.job_id left join sources c on c.source_id=r.source_id where c.source_id is null or j.channel_id<>c.channel_id or j.guild_id<>c.guild_id or j.source_id<>c.source_id or j.channel_name is distinct from c.title or k.channel_name is distinct from c.title or r.channel_name is distinct from c.title or length(trim(c.title))=0),
 'citation_set_mismatch',(select count(*) from results r where not ((select coalesce(array_agg(v->>'messageId'),'{}'::text[]) from jsonb_array_elements(r.citations) v) @> public.discord_summary_citation_ids(r.summary) and (select coalesce(array_agg(v->>'messageId'),'{}'::text[]) from jsonb_array_elements(r.citations) v) <@ public.discord_summary_citation_ids(r.summary))),
 'citation_identity_mismatch',(select count(*) from results r join jobs j on j.id=r.job_id cross join lateral jsonb_array_elements(r.citations) v where coalesce(v->>'messageId','') !~ '^[0-9]{17,20}$' or v->>'url' is distinct from 'https://discord.com/channels/'||j.guild_id||'/'||j.channel_id||'/'||(v->>'messageId')),
 'raw_identity_mismatch',(select count(*) from raw m left join sources c on c.source_id=m.source_id where c.source_id is null or m.channel_id<>c.channel_id or m.guild_id<>c.guild_id or m.channel_name is distinct from c.title or m.payload->>'id' is distinct from m.message_id or m.payload->>'channel_id' is distinct from m.channel_id or m.payload->'author'->>'id' is distinct from m.author_id or m.payload->>'content' is distinct from m.content or (m.payload->>'timestamp')::timestamptz is distinct from m.created_at or m.url is distinct from 'https://discord.com/channels/'||m.guild_id||'/'||m.channel_id||'/'||m.message_id or m.content_hash<>encode(sha256(convert_to(m.embedding_text,'UTF8')),'hex')),
 'raw_structured_image_residue',(select count(*) from raw m where m.payload is distinct from (public.discord_strip_message_images(jsonb_build_object('payload',m.payload,'content',m.content))->'payload')),
 'raw_vector_provenance',(select count(*) from raw where embedding is not null or embedding_model is not null or embedding_provider is not null or embedding_hash is not null)),
 'cleanup',jsonb_build_object('inputs',(select count(*) from public.discord_summary_inputs i join jobs j on j.id=i.job_id),'parts',(select count(*) from public.discord_summary_parts i join jobs j on j.id=i.job_id),'coverage',(select count(*) from public.discord_summary_part_coverage i join jobs j on j.id=i.job_id),'child_links',(select count(*) from public.discord_summary_part_children i join jobs j on j.id=i.job_id),'raw_revisions',(select count(*) from public.discord_message_revisions v join raw m on m.message_id=v.message_id),'orphan_revisions',(select count(*) from public.discord_message_revisions v left join public.discord_messages m on m.message_id=v.message_id where m.message_id is null),'generic_documents',(select count(*) from public.knowledge_documents d join sources c on c.source_id=d.source_id),'generic_chunks',(select count(*) from public.knowledge_chunks k join public.knowledge_documents d on d.id=k.document_id join sources c on c.source_id=d.source_id),'generic_daily_summaries',(select count(*) from public.knowledge_daily_summaries d join sources c on c.source_id=d.source_id)),
 'scope',jsonb_build_object('registered_sources',(select count(*) from sources),'enabled',(select count(*) from sources where enabled),'enabled_disallowed',(select count(*) from sources c where c.enabled and not public.discord_channel_allowed(c.guild_id,c.channel_id)),'active_ledger_disallowed',(select count(*) from ledgers l join sources c using(source_id) where not public.discord_channel_allowed(c.guild_id,c.channel_id)),'sync_succeeded',(select count(*) from public.discord_sync_state st join sources c using(source_id) where st.status='succeeded'),'sync_watermark_min',(select min(last_success_at) from public.discord_sync_state st join sources c using(source_id))),
 'permissions',jsonb_build_object('source_memberships',(select count(*) from public.knowledge_source_members m join sources c on c.source_id=m.source_id),'document_memberships',(select count(*) from public.knowledge_document_members m join sources c on c.source_id=m.source_id),'reader_has_grant',(select exists(select 1 from public.knowledge_source_members m,reader r where m.member_id=r.member_id) or exists(select 1 from public.discord_admin_members a,reader r where a.member_id=r.member_id)),'reader_nonempty_source',(select count(*) from reader_source),'ungranted_reader_results',(select jsonb_array_length(public.discord_summary_list_results(r.member_id,array[s.source_id],null,null,1)) from reader r cross join reader_source s),'protected_tables',(select count(*) from tables),'rls_failures',(select count(*) from tables where not relrowsecurity or not relforcerowsecurity),'browser_table_privileges',(select count(*) from tables where has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')),'restricted_functions',(select count(*) from functions),'function_invoker_or_acl_failures',(select count(*) from functions where prosecdef or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE') or not has_function_privilege('service_role',oid,'EXECUTE')))
) as audit;
```
