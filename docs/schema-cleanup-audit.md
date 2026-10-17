# Schema simplification — October 15, 2026

Migrations 013/014 are applied:14empty obsolete tables removed, Miro 27 to 12 columns
with original JSONB renamed `data`. Migration 015 renames `discord_guild_policies`
to `discord_view_policies`. The user then clarified a shared general-purpose tool
and confirmed removing `knowledge_source_members` and `discord_admin_members`.
Migration 016 replaces per-person checks with trusted backend source scope and
service-only SQL; runtime administrative actions still require backend admin
authority. The hosted database now contains 19 tables. Current hosted verification/deployment
receipts live in milestones/milestone.md and evidence/m28-schema-cleanup/.

[Remaining table guide](database-tables.md). The original pre-cleanup assessment
below explains the initial 14 removals. Its recommendation to retain both member
tables is superseded by the user’s shared-access direction and migration016.

## Miro: remove 15 of 27 columns

Approved target:12 columns, with `snapshot` renamed `data`:

| Purpose | Retain |
| --- | --- |
| Board identity, source permissions and payload | board_id, source_id, data |
| Source configuration | team_id, enabled |
| Configuration/snapshot consistency | config_revision, snapshot_config_revision |
| Freshness and failure state | last_success_at, status, error_code |
| Concurrent-worker protection | lease_token, lease_expires_at |

The15 removal candidates are verified_team_id, title, url, content_hash,
snapshot_version, item_count, connector_count, group_count, tag_count, coverage,
capture_started_at, capture_finished_at, last_attempt_at, created_at and updated_at.
Board metadata, counts, coverage and capture timestamps can be derived from the
existing JSON/source record; URL derives from board ID. Hash/version and extra
audit timestamps are optional. Current RPCs/triggers/readers reference several of
these columns, so a new migration and corresponding reader changes are required.
Keep original migration012 immutable. The board contents themselves stay intact.

## Discord/knowledge: retire 14 of 34 tables

Fresh read-only hosted inventory found27 Discord tables and7 knowledge tables;
`miro_boards` is separate. The14 candidates below all contain zero rows. No
retained table has an inbound FK pointing to these candidates. Function-body
references still exist and require explicit retirement or rewriting.

| Group | Tables | Count |
| --- | --- | --- |
| Retired raw collection | discord_messages, discord_message_revisions, discord_sync_state | 3 |
| Retired raw grouping | discord_memory_buckets, discord_memory_members | 2 |
| Empty old summary processing | discord_summary_inputs, discord_summary_parts, discord_summary_part_coverage, discord_summary_part_children | 4 |
| Dormant generic knowledge payload/state | knowledge_documents, knowledge_document_members, knowledge_chunks, knowledge_daily_summaries, knowledge_sync_state | 5 |

Removing these through a complete cleanup leaves20 tables:11 active Discord
operational tables,7 retained legacy summary/accounting tables, and2 shared
knowledge identity/access tables.

The three generic document tables still have repository APIs/tests, although the
current API does not inject that repository and Google reads directly. Retiring
those interfaces is part of the14-table target. An11-table narrower cleanup can
preserve the generic document scaffold instead.

## Keep populated legacy data and active source access

Keep knowledge_sources and knowledge_source_members: current Discord/Miro reads
depend on source identity and explicit membership. Keep Discord admin, channel,
policy, metadata/discovery tables and all6 new live-summary/vector tables.

Keep these7 legacy tables:

- discord_summary_jobs
- discord_summary_results
- discord_summary_certificates
- discord_summary_requests
- discord_summary_operations
- discord_summary_operation_jobs
- discord_compaction_ledger

The current inventory has722 legacy summaries/jobs/certificates,2245 usage
receipts,2 operations,1417 operation-job mappings and722 compaction ledger records.
The new envelope/search/vector paths still join legacy jobs/results/certificates.
The remaining records retain accounting and provenance. They are not disposable
just because new summaries use a different schema. A later consolidation could
migrate them, but that is a different task requiring data preservation checks.

The FK direction is significant: empty discord_summary_parts references receipt
rows in discord_summary_requests; retained receipts do not reference the empty
scratch table. Removing the scratch table would not delete its parent receipts.

## Required cleanup scope

Replace the retained functions discord_configure_channel,
discord_configure_policy, discord_live_summary_status,
discord_live_summary_cutover and discord_live_summary_retire_archive to remove
old-table references while preserving source policy, concurrency and retirement
guards. Retire old raw/memory/summary-builder RPCs and matching CLI/store paths.
Preserve shared validation helpers used by the new live pipeline, including
discord_summary_period_key, discord_summary_valid_summary and
discord_summary_citation_ids. Preserve the ledger and legacy-result/job guards.

Use a new explicit migration with dependency ordering and zero-row assertions;
do not use blanket CASCADE or rewrite migrations001–012. Test live status,
channel/policy changes, discovery, scheduled summaries, historical/new summary
retrieval, vector hashes, Miro permissions and retained data fingerprints.

Evidence: [hosted inventory](../evidence/schema-cleanup-audit/schema-inventory.json).
It contains exact row counts, relation sizes, FKs, triggers and function/table
reference names; no message/document bodies or credentials. Counts for active
summary processing can change while the worker runs. Two actual read-only
specialists independently reviewed runtime and schema dependencies; the runtime
review's initial10-table estimate was revised to14 after inspecting current empty
scratch tables and FK direction. No implementation tests or deletion ran here.
