# Agent pass report: independent hosted archive verification

- Milestone / role / scope: M17 / independent tester / read-only verification of
  the one authorized Discord source in Supabase project `jssehnrmqhstcrtxulpa`.
- Starting state and files inspected: current milestone/to-do, prior M17
  acceptance and assignment, migration definitions and local evidence guide.
  Orchestrator reported initial backfill complete and catch-up in progress.
- Work performed and changed files: executed three aggregate/catalogue SELECTs
  through `mcp__supabase__execute_sql` against the assigned project. Wrote only
  this report and appended the evidence guide. No application/tests/env changes,
  secrets reads, database mutations, Discord calls, deployments or agents.
- Decisions and assumptions: validate stored identity/timestamps/citations by
  aggregate comparisons, without retrieving original message text or payload
  bodies. Catalogue privilege checks assess hosted schema configuration, not
  a browser-authenticated runtime request.
- Checks and results: all three MCP SQL calls succeeded. At
  `2026-10-11T20:33:45.851140Z`, archive had **10,212 rows and 10,212 unique
  message IDs**, earliest `2024-02-04T19:08:10.482Z`, latest
  `2026-10-10T21:19:07.802Z`. Wrong source scope, malformed IDs, original
  payload identity/timestamp mismatches, exact Discord citation mismatches,
  forbidden nested foreign payloads, invalid timestamp ordering and timestamp
  versus snowflake mismatches were **all zero**. Embedded rows **zero**.
  One channel/source is configured, enabled and active: guild
  `1203562091500404776`, channel `1203562091982622814`, source
  `4bd1da54-bdbd-4a0e-b441-275772d0fb6c`, requested cutoff
  `2015-01-01T00:00:00Z`. Source kind/external ID/original URL match.
  Its checkpoint was **succeeded**, last success
  `2026-10-11T20:33:34.587Z`, window/cursor all null; this is later than
  initial backfill target `2026-10-11T20:31:08.775Z`, independently observing
  completed catch-up. Source rows **10,212**; revisions **zero**.
  At `2026-10-11T20:34:13.713359Z`, **12 application tables** all had enabled
  and forced RLS, no anon/authenticated SELECT access; **12 application RPCs**
  all invoker, no anon/authenticated EXECUTE access, service_role EXECUTE access.
  Source ACL rows/read/write grants and document read grants **zero**; message
  versus configured channel/source mismatches **zero**.
- Findings / failures / unavailable checks: no stored-integrity or catalogue
  access-control failure found. No raw bodies were inspected. This pass does
  not independently compare Discord API history to stored rows, establish
  complete server/private/thread coverage, verify production member
  authentication, prove every historical edit/deletion was detected, or verify
  Railway deployment/scheduler operation.
- Acceptance verdict and remaining work: **PASS for hosted single-source archive
  invariants, completed checkpoint/catch-up and retained access isolation**.
  Entire M17/live Railway launch acceptance remains the orchestrator's separate
  responsibility. Automatic discovery/blacklist and summary/embedding tiers
  remain outside this verification.
- Folder-guide updates needed: evidence guide appended; orchestrator journals
  this pass in shared tracking documents.
- Handoff and recommended next action: record independent hosted acceptance and
  verify exact Railway worker deployment/run/schedule separately.

All queries below were executed with
`project_id: "jssehnrmqhstcrtxulpa"`; no write statement or raw-message output.

## Query 1: stored original invariants

```sql
SELECT now() AS observed_at,
 count(*) AS rows, count(DISTINCT message_id) AS unique_message_ids,
 min(created_at) AS earliest_created_at, max(created_at) AS latest_created_at,
 count(*) FILTER (WHERE channel_id <> '1203562091982622814' OR guild_id <> '1203562091500404776') AS wrong_scope,
 count(*) FILTER (WHERE message_id !~ '^[0-9]{1,20}$' OR author_id !~ '^[0-9]{1,20}$') AS invalid_ids,
 count(*) FILTER (WHERE payload->>'id' IS DISTINCT FROM message_id OR payload->>'channel_id' IS DISTINCT FROM channel_id OR payload->>'guild_id' IS DISTINCT FROM guild_id OR payload->'author'->>'id' IS DISTINCT FROM author_id) AS payload_identity_mismatches,
 count(*) FILTER (WHERE url IS DISTINCT FROM 'https://discord.com/channels/'||guild_id||'/'||channel_id||'/'||message_id) AS citation_mismatches,
 count(*) FILTER (WHERE (payload->>'timestamp')::timestamptz IS DISTINCT FROM created_at OR nullif(payload->>'edited_timestamp','')::timestamptz IS DISTINCT FROM edited_at) AS payload_timestamp_mismatches,
 count(*) FILTER (WHERE payload ?| ARRAY['referenced_message','message_snapshots','resolved','thread']) AS nested_foreign_payloads,
 count(*) FILTER (WHERE created_at < '2015-01-01T00:00:00Z' OR created_at >= now() OR edited_at < created_at) AS invalid_time_order,
 count(*) FILTER (WHERE to_timestamp(((message_id::bigint >> 22) + 1420070400000)::double precision / 1000) IS DISTINCT FROM created_at) AS snowflake_timestamp_mismatches,
 count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_rows
FROM public.discord_messages;
```

Result:
```json
{"observed_at":"2026-10-11 20:33:45.85114+00","rows":10212,"unique_message_ids":10212,"earliest_created_at":"2024-02-04 19:08:10.482+00","latest_created_at":"2026-10-10 21:19:07.802+00","wrong_scope":0,"invalid_ids":0,"payload_identity_mismatches":0,"citation_mismatches":0,"payload_timestamp_mismatches":0,"nested_foreign_payloads":0,"invalid_time_order":0,"snowflake_timestamp_mismatches":0,"embedded_rows":0}
```

## Query 2: configured source and checkpoint

```sql
SELECT c.source_id,c.channel_id,c.guild_id,c.enabled,c.backfill_from,
 s.kind AS source_kind,s.external_id,s.original_url,s.status AS source_status,
 st.status AS checkpoint_status,st.last_success_at,st.window_from,st.window_to,st.before_cursor,st.last_attempt_at,
 (SELECT count(*) FROM public.discord_messages m WHERE m.source_id=c.source_id) AS messages_for_source,
 (SELECT count(*) FROM public.discord_channels) AS configured_channels,
 (SELECT count(*) FROM public.discord_message_revisions) AS archived_revisions
FROM public.discord_channels c
JOIN public.knowledge_sources s ON s.id=c.source_id
LEFT JOIN public.discord_sync_state st ON st.source_id=c.source_id
ORDER BY c.channel_id;
```

Result:
```json
{"source_id":"4bd1da54-bdbd-4a0e-b441-275772d0fb6c","channel_id":"1203562091982622814","guild_id":"1203562091500404776","enabled":true,"backfill_from":"2015-01-01 00:00:00+00","source_kind":"discord","external_id":"1203562091982622814","original_url":"https://discord.com/channels/1203562091500404776/1203562091982622814","source_status":"active","checkpoint_status":"succeeded","last_success_at":"2026-10-11 20:33:34.587+00","window_from":null,"window_to":null,"before_cursor":null,"last_attempt_at":"2026-10-11 20:33:35.913286+00","messages_for_source":10212,"configured_channels":1,"archived_revisions":0}
```

## Query 3: hosted access isolation and source consistency

```sql
SELECT now() AS observed_at,
 (SELECT count(*) FROM public.knowledge_source_members) AS source_acl_rows,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_read) AS source_read_grants,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_write) AS source_write_grants,
 (SELECT count(*) FROM public.knowledge_document_members WHERE can_read) AS document_read_grants,
 (SELECT count(*) FROM public.discord_messages m LEFT JOIN public.discord_channels c ON c.source_id=m.source_id
  WHERE c.source_id IS NULL OR m.channel_id IS DISTINCT FROM c.channel_id OR m.guild_id IS DISTINCT FROM c.guild_id) AS source_channel_mismatches,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')) AS application_tables,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS tables_without_forced_rls,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT'))) AS browser_readable_tables,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')) AS application_rpcs,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')
  AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))) AS rpc_privilege_or_invoker_mismatches;
```

Result:
```json
{"observed_at":"2026-10-11 20:34:13.713359+00","source_acl_rows":0,"source_read_grants":0,"source_write_grants":0,"document_read_grants":0,"source_channel_mismatches":0,"application_tables":12,"tables_without_forced_rls":0,"browser_readable_tables":0,"application_rpcs":12,"rpc_privilege_or_invoker_mismatches":0}
```

