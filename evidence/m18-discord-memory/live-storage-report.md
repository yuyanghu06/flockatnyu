# Agent pass report: M18 hosted grouped-storage verification

- Milestone / role / scope: M18 / independent tester / aggregate and catalogue
  SELECTs only against Supabase project `jssehnrmqhstcrtxulpa`.
- Starting state: root reported SQL003 applied, authorized prior archive reset,
  policy revision 3 and metadata-only discovery running. Railway is outside
  this tester assignment.
- Work performed: eleven read-only MCP SQL calls completed; no raw message text,
  payload bodies, secrets, database writes, Discord calls or deployment actions.
  Sole owned output is this report.
- Current checks: at `2026-10-11T20:58:18.253312Z`, 17 application tables all
  enabled/forced RLS and no anon/authenticated CRUD access; 25 application
  functions all invoker, no browser EXECUTE and service_role EXECUTE granted.
  One operator, zero source ACL/read/write/document-read grants. Unknown channel
  allowed=false.
  At `2026-10-11T20:58:33.605369Z`, policy revision 3 unpaused with exactly the
  authorized four categories and one channel excluded, cutoff
  `2015-01-01T00:00:00Z`. Discovery phase archives at revision 3; 217 metadata
  nodes, 167 registered channels, 30 visible blacklisted nodes. Zero blacklisted
  metadata/collection eligibility or denied/unknown collection eligibility.
  **Zero collection-eligible channels while discovery is incomplete.**
  Zero originals/memory buckets/memory members at this observation.
- Verdict: hosted catalogue, policy, discovery gate, completed raw archive,
  checkpoints, grouped storage, permission denials and final scoped runtime
  function attributes **PASS**. No server-wide
  history, worker or schedule completion claimed.
- Completed archive: at `2026-10-11T21:29:36.813750Z`, 108,828 unique originals
  across 213 nonempty sources, earliest `2024-02-04T18:53:18.480Z`, latest
  `2026-10-11T20:33:07.676Z`. Zero scope, identity, payload/snowflake timestamp,
  raw-body content, citation, extracted-text hash, foreign-payload, vector or
  image-metadata mismatches. All 216 enabled sources have succeeded checkpoints
  equal to fixed target `2026-10-11T21:02:08.697Z`; no missing/running checkpoints
  or unfinished windows. Discovery complete, revision 3: 266 metadata nodes,
  216 registered/eligible sources; all 30 visible blacklisted nodes ineligible.
- Grouped storage: after root published classification, observed 108,828 unique
  memberships, exactly one per original, 779 groups; zero unassigned originals,
  cross-source memberships, bucket counts, helper-period or policy mismatches.
  Daily: 84 groups / 1,867 originals; weekly: 22 / 1,620; monthly: 673 / 105,341.
  All groups use fixed target `2026-10-11T21:02:08.697Z`. Independent date
  arithmetic checked all memberships, with zero tier/start/end or rolling
  168-hour/month/week precedence mismatches. Operator without a reader grant,
  unprovisioned member and empty trusted scope all retrieve zero grouped rows;
  probe sampled an existing bucket. Final catalogue/grants remained unchanged.
- Findings / remaining work: initial classification RPC HTTP 500 / code 57014
  timeout left zero buckets/members; this tester observed that rollback state.
  Root reports the optimized 004 runtime still exceeded the service_role inherited
  timeout; root separately ran classification through MCP and published groups.
  After applying 005, root reports the actual updated-store/PostgREST management
  classification returned ready / exit 0 in 43,218 ms, 779 groups / 108,828
  originals at revision 3 and the fixed target. That runtime invocation was
  executed by root, not this tester. At `2026-10-11T21:50:10.225923Z`, tester
  independently verified hosted rebuild body MD5 equals the locally tested 004
  implementation, invoker/service-only permissions, and only this function has
  `statement_timeout=60s` / `work_mem=16MB`. Other application RPC extended-budget
  count is zero; final catalogue and zero reader grants remained unchanged.
  Railway deployment/scheduling remains a separate evaluator check. Tester
  performed no hosted classification writes or timeout changes.
- Folder-guide updates needed: orchestrator can update the evidence guide and
  journal after final classification verification.
- Handoff: hosted storage acceptance is complete within discovered, eligible bot
  scope. This does not establish inaccessible/deleted history, full guild coverage,
  private-thread completeness or Railway schedule health. Orchestrator records
  this pass and combines it with the separate deployment/runtime evidence.

## Executed query 1: hosted catalogue and grants

```sql
SELECT now() AS observed_at,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')) AS application_tables,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS tables_without_forced_rls,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) AS browser_accessible_tables,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')) AS application_functions,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')
  AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))) AS function_access_or_invoker_mismatches,
 (SELECT count(*) FROM public.discord_admin_members) AS operator_rows,
 (SELECT count(*) FROM public.knowledge_source_members) AS source_acl_rows,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_read) AS source_read_grants,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_write) AS source_write_grants,
 (SELECT count(*) FROM public.knowledge_document_members WHERE can_read) AS document_read_grants,
 public.discord_channel_allowed('1203562091500404776','999999999999999999') AS unknown_channel_allowed;
```

```json
[
  {
    "observed_at": "2026-10-11 20:58:18.253312+00",
    "application_tables": 17,
    "tables_without_forced_rls": 0,
    "browser_accessible_tables": 0,
    "application_functions": 25,
    "function_access_or_invoker_mismatches": 0,
    "operator_rows": 1,
    "source_acl_rows": 0,
    "source_read_grants": 0,
    "source_write_grants": 0,
    "document_read_grants": 0,
    "unknown_channel_allowed": false
  }
]
```

## Executed query 2: runtime policy and discovery collection gate

```sql
WITH RECURSIVE blocked(channel_id) AS (
 SELECT unnest(excluded_category_ids || excluded_channel_ids) FROM public.discord_guild_policies WHERE guild_id='1203562091500404776'
 UNION
 SELECT m.channel_id FROM public.discord_channel_metadata m JOIN blocked b ON m.parent_id=b.channel_id WHERE m.guild_id='1203562091500404776'
)
SELECT now() AS observed_at,p.guild_id,p.revision,p.paused,p.discovery_enabled,p.backfill_from,
 ARRAY(SELECT x FROM unnest(p.excluded_category_ids) x ORDER BY x) AS excluded_categories,
 ARRAY(SELECT x FROM unnest(p.excluded_channel_ids) x ORDER BY x) AS excluded_channels,
 cardinality(p.excluded_category_ids)=4 AND p.excluded_category_ids @> ARRAY['1461311169586266165','1533053124606955600','1203562092213305371','1203562092376891445'] AS exact_category_exclusions,
 p.excluded_channel_ids=ARRAY['1203562091982622819'] AS exact_channel_exclusions,
 d.state->>'phase' AS discovery_phase,d.policy_revision AS discovery_policy_revision,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id) AS discovered_nodes,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id AND m.eligible) AS metadata_eligible_nodes,
 (SELECT count(*) FROM public.discord_channels c WHERE c.guild_id=p.guild_id) AS registered_channels,
 (SELECT count(*) FROM public.discord_sync_channels() c WHERE c.guild_id=p.guild_id) AS collection_eligible_channels,
 (SELECT count(*) FROM public.discord_channel_metadata m JOIN blocked b ON b.channel_id=m.channel_id WHERE m.guild_id=p.guild_id) AS visible_blocklisted_nodes,
 (SELECT count(*) FROM public.discord_channel_metadata m JOIN blocked b ON b.channel_id=m.channel_id WHERE m.guild_id=p.guild_id AND m.eligible) AS blocklisted_metadata_eligible,
 (SELECT count(*) FROM public.discord_channels c JOIN blocked b ON b.channel_id=c.channel_id WHERE c.guild_id=p.guild_id AND public.discord_channel_allowed(c.guild_id,c.channel_id)) AS blocklisted_collection_eligible,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id AND m.access_status IN('permission_denied','not_found','unknown_ancestry','excluded') AND public.discord_channel_allowed(m.guild_id,m.channel_id)) AS denied_or_unknown_collection_eligible,
 (SELECT count(*) FROM public.discord_messages) AS original_rows,
 (SELECT count(*) FROM public.discord_memory_buckets) AS memory_buckets,
 (SELECT count(*) FROM public.discord_memory_members) AS memory_members
FROM public.discord_guild_policies p LEFT JOIN public.discord_discovery_state d ON d.guild_id=p.guild_id
WHERE p.guild_id='1203562091500404776';
```

```json
[
  {
    "observed_at": "2026-10-11 20:58:33.605369+00",
    "guild_id": "1203562091500404776",
    "revision": 3,
    "paused": false,
    "discovery_enabled": true,
    "backfill_from": "2015-01-01 00:00:00+00",
    "excluded_categories": [
      "1203562092213305371",
      "1203562092376891445",
      "1461311169586266165",
      "1533053124606955600"
    ],
    "excluded_channels": [
      "1203562091982622819"
    ],
    "exact_category_exclusions": true,
    "exact_channel_exclusions": true,
    "discovery_phase": "archives",
    "discovery_policy_revision": 3,
    "discovered_nodes": 217,
    "metadata_eligible_nodes": 167,
    "registered_channels": 167,
    "collection_eligible_channels": 0,
    "visible_blocklisted_nodes": 30,
    "blocklisted_metadata_eligible": 0,
    "blocklisted_collection_eligible": 0,
    "denied_or_unknown_collection_eligible": 0,
    "original_rows": 0,
    "memory_buckets": 0,
    "memory_members": 0
  }
]
```

## Executed query 3: original identity, scope and image removal

```sql
WITH checked_sources AS MATERIALIZED (SELECT c.*,public.discord_channel_allowed(c.guild_id,c.channel_id) AS allowed FROM public.discord_channels c)
SELECT now() AS observed_at,count(*) AS original_rows,count(DISTINCT m.message_id) AS unique_original_ids,
 count(DISTINCT m.source_id) AS sources_with_originals,min(m.created_at) AS earliest_created_at,max(m.created_at) AS latest_created_at,
 count(*) FILTER(WHERE m.guild_id<>'1203562091500404776') AS wrong_guild_rows,
 count(*) FILTER(WHERE c.source_id IS NULL OR m.channel_id IS DISTINCT FROM c.channel_id OR m.guild_id IS DISTINCT FROM c.guild_id) AS source_scope_mismatches,
 count(*) FILTER(WHERE NOT coalesce(c.allowed,false)) AS currently_ineligible_originals,
 count(*) FILTER(WHERE m.payload->>'id' IS DISTINCT FROM m.message_id OR m.payload->>'channel_id' IS DISTINCT FROM m.channel_id
 OR m.payload->>'guild_id' IS DISTINCT FROM m.guild_id OR m.payload->'author'->>'id' IS DISTINCT FROM m.author_id) AS original_identity_mismatches,
 count(*) FILTER(WHERE (m.payload->>'timestamp')::timestamptz IS DISTINCT FROM m.created_at OR nullif(m.payload->>'edited_timestamp','')::timestamptz IS DISTINCT FROM m.edited_at) AS original_timestamp_mismatches,
 count(*) FILTER(WHERE abs(extract(epoch FROM m.created_at)*1000-((m.message_id::bigint >> 22)+1420070400000))>=1) AS snowflake_timestamp_mismatches,
 count(*) FILTER(WHERE m.content IS DISTINCT FROM coalesce(m.payload->>'content','')) AS raw_body_content_mismatches,
 count(*) FILTER(WHERE m.url IS DISTINCT FROM 'https://discord.com/channels/'||m.guild_id||'/'||m.channel_id||'/'||m.message_id) AS citation_mismatches,
 count(*) FILTER(WHERE m.content_hash IS DISTINCT FROM encode(sha256(convert_to(m.embedding_text,'UTF8')),'hex')) AS extracted_text_hash_mismatches,
 count(*) FILTER(WHERE m.payload ?| ARRAY['referenced_message','message_snapshots','resolved','thread']) AS forbidden_foreign_payloads,
 count(*) FILTER(WHERE m.embedding IS NOT NULL OR m.embedding_model IS NOT NULL OR m.embedding_provider IS NOT NULL OR m.embedding_hash IS NOT NULL) AS any_vector_provenance_rows,
 count(*) FILTER(WHERE jsonb_path_exists(m.payload,'$.**.image') OR jsonb_path_exists(m.payload,'$.**.thumbnail') OR jsonb_path_exists(m.payload,'$.**.avatar')
 OR jsonb_path_exists(m.payload,'$.**.avatar_decoration_data') OR jsonb_path_exists(m.payload,'$.**.banner') OR jsonb_path_exists(m.payload,'$.**.icon_url')
 OR jsonb_path_exists(m.payload,'$.**.proxy_icon_url') OR jsonb_path_exists(m.payload,'$.components.** ? (@.type == 11 || @.type == 12)')
 OR jsonb_path_exists(m.payload,'$.components.**.media')
 OR EXISTS(SELECT 1 FROM jsonb_path_query(m.payload,'$.components.** ? (@.type == 13)') f(v)
 WHERE coalesce(f.v->'file'->>'url','') ~* '[.](png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.payload->'attachments')='array' THEN m.payload->'attachments' ELSE '[]'::jsonb END) a
 WHERE coalesce(a->>'content_type','') ~* '^image/' OR coalesce(a->>'filename','') ~* '[.](png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)'
 OR coalesce(a->>'url','') ~* '[.](png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)([?#]|$)')) AS image_metadata_rows
FROM public.discord_messages m LEFT JOIN checked_sources c ON c.source_id=m.source_id;
```

```json
[
  {
    "observed_at": "2026-10-11 21:29:36.81375+00",
    "original_rows": 108828,
    "unique_original_ids": 108828,
    "sources_with_originals": 213,
    "earliest_created_at": "2024-02-04 18:53:18.48+00",
    "latest_created_at": "2026-10-11 20:33:07.676+00",
    "wrong_guild_rows": 0,
    "source_scope_mismatches": 0,
    "currently_ineligible_originals": 0,
    "original_identity_mismatches": 0,
    "original_timestamp_mismatches": 0,
    "snowflake_timestamp_mismatches": 0,
    "raw_body_content_mismatches": 0,
    "citation_mismatches": 0,
    "extracted_text_hash_mismatches": 0,
    "forbidden_foreign_payloads": 0,
    "any_vector_provenance_rows": 0,
    "image_metadata_rows": 0
  }
]
```

## Executed query 4: fixed-target checkpoints

```sql
SELECT now() AS observed_at,
 count(*) FILTER(WHERE c.enabled AND public.discord_channel_allowed(c.guild_id,c.channel_id)) AS enabled_eligible_sources,
 count(*) FILTER(WHERE c.enabled AND st.source_id IS NULL) AS enabled_missing_checkpoints,
 count(*) FILTER(WHERE c.enabled AND st.status='succeeded') AS enabled_succeeded_checkpoints,
 count(*) FILTER(WHERE c.enabled AND st.status='running') AS enabled_running_checkpoints,
 count(*) FILTER(WHERE c.enabled AND st.last_success_at IS DISTINCT FROM '2026-10-11T21:02:08.697Z'::timestamptz) AS enabled_watermark_target_mismatches,
 count(*) FILTER(WHERE c.enabled AND (st.window_from IS NOT NULL OR st.window_to IS NOT NULL OR st.before_cursor IS NOT NULL)) AS enabled_unfinished_windows,
 count(*) FILTER(WHERE c.enabled AND st.last_success_at IS NOT NULL) AS enabled_stored_watermarks,
 count(*) FILTER(WHERE c.enabled AND NOT public.discord_channel_allowed(c.guild_id,c.channel_id)) AS enabled_ineligible_sources,
 min(st.last_success_at) FILTER(WHERE c.enabled) AS minimum_enabled_watermark,
 max(st.last_success_at) FILTER(WHERE c.enabled) AS maximum_enabled_watermark
FROM public.discord_channels c LEFT JOIN public.discord_sync_state st ON st.source_id=c.source_id
WHERE c.guild_id='1203562091500404776';
```

```json
[
  {
    "observed_at": "2026-10-11 21:29:36.322295+00",
    "enabled_eligible_sources": 216,
    "enabled_missing_checkpoints": 0,
    "enabled_succeeded_checkpoints": 216,
    "enabled_running_checkpoints": 0,
    "enabled_watermark_target_mismatches": 0,
    "enabled_unfinished_windows": 0,
    "enabled_stored_watermarks": 216,
    "enabled_ineligible_sources": 0,
    "minimum_enabled_watermark": "2026-10-11 21:02:08.697+00",
    "maximum_enabled_watermark": "2026-10-11 21:02:08.697+00"
  }
]
```

## Executed query 5: completed discovery and final exclusions

```sql
WITH RECURSIVE blocked(channel_id) AS (
 SELECT unnest(excluded_category_ids || excluded_channel_ids) FROM public.discord_guild_policies WHERE guild_id='1203562091500404776'
 UNION
 SELECT m.channel_id FROM public.discord_channel_metadata m JOIN blocked b ON m.parent_id=b.channel_id WHERE m.guild_id='1203562091500404776'
)
SELECT now() AS observed_at,p.guild_id,p.revision,p.paused,p.discovery_enabled,p.backfill_from,
 ARRAY(SELECT x FROM unnest(p.excluded_category_ids) x ORDER BY x) AS excluded_categories,
 ARRAY(SELECT x FROM unnest(p.excluded_channel_ids) x ORDER BY x) AS excluded_channels,
 cardinality(p.excluded_category_ids)=4 AND p.excluded_category_ids @> ARRAY['1461311169586266165','1533053124606955600','1203562092213305371','1203562092376891445'] AS exact_category_exclusions,
 p.excluded_channel_ids=ARRAY['1203562091982622819'] AS exact_channel_exclusions,
 d.state->>'phase' AS discovery_phase,d.policy_revision AS discovery_policy_revision,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id) AS discovered_nodes,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id AND m.eligible) AS metadata_eligible_nodes,
 (SELECT count(*) FROM public.discord_channels c WHERE c.guild_id=p.guild_id) AS registered_channels,
 (SELECT count(*) FROM public.discord_sync_channels() c WHERE c.guild_id=p.guild_id) AS collection_eligible_channels,
 (SELECT count(*) FROM public.discord_channel_metadata m JOIN blocked b ON b.channel_id=m.channel_id WHERE m.guild_id=p.guild_id) AS visible_blocklisted_nodes,
 (SELECT count(*) FROM public.discord_channel_metadata m JOIN blocked b ON b.channel_id=m.channel_id WHERE m.guild_id=p.guild_id AND m.eligible) AS blocklisted_metadata_eligible,
 (SELECT count(*) FROM public.discord_channels c JOIN blocked b ON b.channel_id=c.channel_id WHERE c.guild_id=p.guild_id AND public.discord_channel_allowed(c.guild_id,c.channel_id)) AS blocklisted_collection_eligible,
 (SELECT count(*) FROM public.discord_channel_metadata m WHERE m.guild_id=p.guild_id AND m.access_status IN('permission_denied','not_found','unknown_ancestry','excluded') AND public.discord_channel_allowed(m.guild_id,m.channel_id)) AS denied_or_unknown_collection_eligible,
 (SELECT count(*) FROM public.discord_messages) AS original_rows,
 (SELECT count(*) FROM public.discord_memory_buckets) AS memory_buckets,
 (SELECT count(*) FROM public.discord_memory_members) AS memory_members
FROM public.discord_guild_policies p LEFT JOIN public.discord_discovery_state d ON d.guild_id=p.guild_id
WHERE p.guild_id='1203562091500404776';
```

```json
[
  {
    "observed_at": "2026-10-11 21:29:59.158477+00",
    "guild_id": "1203562091500404776",
    "revision": 3,
    "paused": false,
    "discovery_enabled": true,
    "backfill_from": "2015-01-01 00:00:00+00",
    "excluded_categories": [
      "1203562092213305371",
      "1203562092376891445",
      "1461311169586266165",
      "1533053124606955600"
    ],
    "excluded_channels": [
      "1203562091982622819"
    ],
    "exact_category_exclusions": true,
    "exact_channel_exclusions": true,
    "discovery_phase": "complete",
    "discovery_policy_revision": 3,
    "discovered_nodes": 266,
    "metadata_eligible_nodes": 216,
    "registered_channels": 216,
    "collection_eligible_channels": 216,
    "visible_blocklisted_nodes": 30,
    "blocklisted_metadata_eligible": 0,
    "blocklisted_collection_eligible": 0,
    "denied_or_unknown_collection_eligible": 0,
    "original_rows": 108828,
    "memory_buckets": 0,
    "memory_members": 0
  }
]
```

## Executed query 6: final catalogue and grants

```sql
SELECT now() AS observed_at,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')) AS application_tables,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS tables_without_forced_rls,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) AS browser_accessible_tables,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')) AS application_functions,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')
  AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))) AS function_access_or_invoker_mismatches,
 (SELECT count(*) FROM public.discord_admin_members) AS operator_rows,
 (SELECT count(*) FROM public.knowledge_source_members) AS source_acl_rows,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_read) AS source_read_grants,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_write) AS source_write_grants,
 (SELECT count(*) FROM public.knowledge_document_members WHERE can_read) AS document_read_grants,
 public.discord_channel_allowed('1203562091500404776','999999999999999999') AS unknown_channel_allowed;
```

```json
[
  {
    "observed_at": "2026-10-11 21:42:39.353409+00",
    "application_tables": 17,
    "tables_without_forced_rls": 0,
    "browser_accessible_tables": 0,
    "application_functions": 25,
    "function_access_or_invoker_mismatches": 0,
    "operator_rows": 1,
    "source_acl_rows": 0,
    "source_read_grants": 0,
    "source_write_grants": 0,
    "document_read_grants": 0,
    "unknown_channel_allowed": false
  }
]
```

## Executed query 7: original-to-membership bijection and bucket integrity

```sql
WITH checked_sources AS MATERIALIZED (SELECT c.*,public.discord_channel_allowed(c.guild_id,c.channel_id) AS allowed FROM public.discord_channels c)
SELECT now() AS observed_at,
 (SELECT count(*) FROM public.discord_memory_buckets) AS buckets,
 (SELECT count(*) FROM public.discord_memory_members) AS membership_rows,
 (SELECT count(DISTINCT message_id) FROM public.discord_memory_members) AS uniquely_assigned_originals,
 (SELECT count(*) FROM public.discord_messages m WHERE NOT EXISTS(SELECT 1 FROM public.discord_memory_members mm WHERE mm.message_id=m.message_id)) AS unassigned_originals,
 (SELECT count(*) FROM public.discord_memory_members mm JOIN public.discord_memory_buckets b ON b.id=mm.bucket_id JOIN public.discord_messages m ON m.message_id=mm.message_id WHERE mm.source_id IS DISTINCT FROM b.source_id OR mm.source_id IS DISTINCT FROM m.source_id) AS cross_source_memberships,
 (SELECT count(*) FROM public.discord_memory_buckets b WHERE b.message_count<>(SELECT count(*) FROM public.discord_memory_members mm WHERE mm.bucket_id=b.id)) AS bucket_count_mismatches,
 (SELECT count(*) FROM public.discord_memory_members mm JOIN public.discord_memory_buckets b ON b.id=mm.bucket_id JOIN public.discord_messages m ON m.message_id=mm.message_id LEFT JOIN LATERAL public.discord_memory_period(m.created_at,b.as_of) p ON true
 WHERE b.tier IS DISTINCT FROM p.tier OR b.period_start IS DISTINCT FROM p.period_start OR b.period_end IS DISTINCT FROM p.period_end
 OR m.created_at<b.period_start OR m.created_at>=b.period_end OR b.timezone<>'America/New_York') AS temporal_membership_mismatches,
 (SELECT count(*) FROM public.discord_memory_buckets b JOIN checked_sources c ON c.source_id=b.source_id JOIN public.discord_guild_policies p ON p.guild_id=c.guild_id WHERE b.policy_revision IS DISTINCT FROM p.revision OR NOT c.allowed) AS policy_or_eligibility_bucket_mismatches,
 (SELECT min(as_of) FROM public.discord_memory_buckets) AS grouping_as_of_min,
 (SELECT max(as_of) FROM public.discord_memory_buckets) AS grouping_as_of_max,
 (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM(SELECT tier,count(*) AS buckets,sum(message_count) AS originals FROM public.discord_memory_buckets GROUP BY tier ORDER BY tier) t) AS tier_counts,
 (SELECT count(*) FROM public.knowledge_daily_summaries) AS generated_summary_rows,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_read OR can_write) AS member_source_grants,
 (SELECT count(*) FROM public.discord_sync_state st JOIN public.discord_channels c ON c.source_id=st.source_id WHERE c.guild_id='1203562091500404776' AND st.status='running') AS running_checkpoints,
 (SELECT count(*) FROM public.discord_sync_state st JOIN public.discord_channels c ON c.source_id=st.source_id WHERE c.guild_id='1203562091500404776' AND st.status='succeeded') AS succeeded_checkpoints,
 (SELECT min(st.last_success_at) FROM public.discord_sync_state st JOIN public.discord_channels c ON c.source_id=st.source_id WHERE c.guild_id='1203562091500404776' AND c.enabled) AS oldest_success_at,
 (SELECT max(st.last_success_at) FROM public.discord_sync_state st JOIN public.discord_channels c ON c.source_id=st.source_id WHERE c.guild_id='1203562091500404776' AND c.enabled) AS newest_success_at;
```

```json
[
  {
    "observed_at": "2026-10-11 21:42:40.507166+00",
    "buckets": 779,
    "membership_rows": 108828,
    "uniquely_assigned_originals": 108828,
    "unassigned_originals": 0,
    "cross_source_memberships": 0,
    "bucket_count_mismatches": 0,
    "temporal_membership_mismatches": 0,
    "policy_or_eligibility_bucket_mismatches": 0,
    "grouping_as_of_min": "2026-10-11 21:02:08.697+00",
    "grouping_as_of_max": "2026-10-11 21:02:08.697+00",
    "tier_counts": [
      {
        "tier": "daily",
        "buckets": 84,
        "originals": 1867
      },
      {
        "tier": "monthly",
        "buckets": 673,
        "originals": 105341
      },
      {
        "tier": "weekly",
        "buckets": 22,
        "originals": 1620
      }
    ],
    "generated_summary_rows": 0,
    "member_source_grants": 0,
    "running_checkpoints": 0,
    "succeeded_checkpoints": 216,
    "oldest_success_at": "2026-10-11 21:02:08.697+00",
    "newest_success_at": "2026-10-11 21:02:08.697+00"
  }
]
```

## Executed query 8: independent calendar arithmetic

```sql
WITH original_members AS (
 SELECT m.created_at,b.*, (m.created_at AT TIME ZONE 'America/New_York')::date AS local_date,
 (b.as_of AT TIME ZONE 'America/New_York')::date AS as_of_date,
 b.as_of - interval '168 hours' AS cutoff
 FROM public.discord_memory_members mm JOIN public.discord_memory_buckets b ON b.id=mm.bucket_id
 JOIN public.discord_messages m ON m.message_id=mm.message_id
), dates AS (
 SELECT *,make_date(extract(year FROM as_of_date)::int,extract(month FROM as_of_date)::int,1) AS current_month,
 make_date(extract(year FROM local_date)::int,extract(month FROM local_date)::int,1) AS original_month,
 local_date-(extract(isodow FROM local_date)::int-1) AS monday
 FROM original_members
), expected AS (
 SELECT *,CASE WHEN created_at>=cutoff THEN 'daily' WHEN local_date>=current_month THEN 'weekly' ELSE 'monthly' END AS expected_tier,
 CASE WHEN created_at>=cutoff THEN greatest(local_date::timestamp AT TIME ZONE 'America/New_York',cutoff)
 WHEN local_date>=current_month THEN greatest(monday::timestamp AT TIME ZONE 'America/New_York',current_month::timestamp AT TIME ZONE 'America/New_York')
 ELSE original_month::timestamp AT TIME ZONE 'America/New_York' END AS expected_start,
 CASE WHEN created_at>=cutoff THEN least((local_date+1)::timestamp AT TIME ZONE 'America/New_York',as_of)
 WHEN local_date>=current_month THEN least((monday+7)::timestamp AT TIME ZONE 'America/New_York',cutoff)
 ELSE least((original_month+interval '1 month') AT TIME ZONE 'America/New_York',cutoff) END AS expected_end
 FROM dates
)
SELECT now() AS observed_at,count(*) AS checked_memberships,
 count(*) FILTER(WHERE tier<>expected_tier) AS independent_tier_mismatches,
 count(*) FILTER(WHERE period_start IS DISTINCT FROM expected_start OR period_end IS DISTINCT FROM expected_end) AS independent_period_mismatches,
 count(*) FILTER(WHERE tier='daily' AND (created_at<cutoff OR created_at>=as_of)) AS daily_outside_168_hour_window,
 count(*) FILTER(WHERE tier='weekly' AND (local_date<current_month OR created_at>=cutoff)) AS weekly_outside_current_month_or_recent_cutoff,
 count(*) FILTER(WHERE tier='monthly' AND (local_date>=current_month OR created_at>=cutoff)) AS monthly_priority_mismatches
FROM expected;
```

```json
[
  {
    "observed_at": "2026-10-11 21:42:29.134769+00",
    "checked_memberships": 108828,
    "independent_tier_mismatches": 0,
    "independent_period_mismatches": 0,
    "daily_outside_168_hour_window": 0,
    "weekly_outside_current_month_or_recent_cutoff": 0,
    "monthly_priority_mismatches": 0
  }
]
```

## Executed query 9: grouped retrieval denies missing reader grants

```sql
WITH sample AS (
 SELECT b.id,b.source_id FROM public.discord_memory_buckets b ORDER BY b.id LIMIT 1
), operator_member AS (
 SELECT member_id FROM public.discord_admin_members ORDER BY member_id LIMIT 1
)
SELECT now() AS observed_at,
 (SELECT count(*) FROM sample s CROSS JOIN operator_member o CROSS JOIN LATERAL public.discord_memory_list(o.member_id,ARRAY[s.source_id]::uuid[]) x) AS operator_without_reader_grant_list_rows,
 (SELECT count(*) FROM sample s CROSS JOIN operator_member o CROSS JOIN LATERAL public.discord_memory_page(o.member_id,ARRAY[s.source_id]::uuid[],s.id) x) AS operator_without_reader_grant_page_rows,
 (SELECT count(*) FROM sample s CROSS JOIN LATERAL public.discord_memory_list('unprovisioned-tester',ARRAY[s.source_id]::uuid[]) x) AS unprovisioned_list_rows,
 (SELECT count(*) FROM sample s CROSS JOIN LATERAL public.discord_memory_page('unprovisioned-tester',ARRAY[s.source_id]::uuid[],s.id) x) AS unprovisioned_page_rows,
 (SELECT count(*) FROM operator_member o CROSS JOIN LATERAL public.discord_memory_list(o.member_id,ARRAY[]::uuid[]) x) AS empty_trusted_scope_list_rows,
 (SELECT count(*) FROM sample) AS sampled_bucket_rows;
```

```json
[
  {
    "observed_at": "2026-10-11 21:42:39.938178+00",
    "operator_without_reader_grant_list_rows": 0,
    "operator_without_reader_grant_page_rows": 0,
    "unprovisioned_list_rows": 0,
    "unprovisioned_page_rows": 0,
    "empty_trusted_scope_list_rows": 0,
    "sampled_bucket_rows": 1
  }
]
```

## Executed query 10: scoped function budget and verified implementation body

```sql
SELECT now() AS observed_at,
 (SELECT md5(p.prosrc)='2d9a2baffafb9056e3b0c07fb159d373' FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='discord_rebuild_memory') AS hosted_body_matches_verified_local_004,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='discord_rebuild_memory'
 AND p.proconfig @> ARRAY['statement_timeout=60s','work_mem=16MB']
 AND NOT p.prosecdef AND has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS scoped_rebuild_budget_and_permissions_valid,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')
 AND p.proname<>'discord_rebuild_memory'
 AND (p.proconfig @> ARRAY['statement_timeout=60s'] OR p.proconfig @> ARRAY['work_mem=16MB'])) AS other_application_rpc_extended_budget_count;
```

```json
[
  {
    "observed_at": "2026-10-11 21:50:10.225923+00",
    "hosted_body_matches_verified_local_004": true,
    "scoped_rebuild_budget_and_permissions_valid": 1,
    "other_application_rpc_extended_budget_count": 0
  }
]
```

## Executed query 11: final catalogue and grants after runtime completion

```sql
SELECT now() AS observed_at,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')) AS application_tables,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS tables_without_forced_rls,
 (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname LIKE 'discord_%' OR c.relname LIKE 'knowledge_%')
  AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) AS browser_accessible_tables,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')) AS application_functions,
 (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'discord_%' OR p.proname LIKE 'knowledge_%')
  AND (p.prosecdef OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))) AS function_access_or_invoker_mismatches,
 (SELECT count(*) FROM public.discord_admin_members) AS operator_rows,
 (SELECT count(*) FROM public.knowledge_source_members) AS source_acl_rows,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_read) AS source_read_grants,
 (SELECT count(*) FROM public.knowledge_source_members WHERE can_write) AS source_write_grants,
 (SELECT count(*) FROM public.knowledge_document_members WHERE can_read) AS document_read_grants,
 public.discord_channel_allowed('1203562091500404776','999999999999999999') AS unknown_channel_allowed;
```

```json
[
  {
    "observed_at": "2026-10-11 21:50:09.971438+00",
    "application_tables": 17,
    "tables_without_forced_rls": 0,
    "browser_accessible_tables": 0,
    "application_functions": 25,
    "function_access_or_invoker_mismatches": 0,
    "operator_rows": 1,
    "source_acl_rows": 0,
    "source_read_grants": 0,
    "source_write_grants": 0,
    "document_read_grants": 0,
    "unknown_channel_allowed": false
  }
]
```

