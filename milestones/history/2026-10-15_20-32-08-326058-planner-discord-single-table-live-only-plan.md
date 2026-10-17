# Discord single-table live-only plan

- Local timestamp / acting role / milestone: 2026-10-15_20-32-08-326058 / planner / M29.
- Requested scope: Delete all Discord summary/accounting/storage tables; all content access uses the bot live; retain a single table like discord_view_policies with available channels.
- Starting repository state: M28 applied001–016,19tables, stored-summary worker/service active; concurrent dirty workspace preserved.
- Work performed / changed files: Read-only planner inspected current SQL/runtime/deployments and coordinated schema/RPC contracts with the coder; no planner edits.
- Decisions: Keep discord_view_policies with channels JSONB, discovery_state JSONB and last discovery freshness, plus existing settings. Consolidate all269metadata/ancestry nodes and219stable sourceUUIDs. Drop16otherDiscordtables and24obsoletefunctions explicitly. Delete Discord knowledge_sources rows only after proving their IDs are captured in the catalogue; preserve Miro/unrelated sources. Final3publictables. Live bot source scope/exclusions/admin and on-demand RAM summarization remain; no durable fallback or scheduled summaries.
- Checks and evidence: Source/dependency review only. Existing9catalogueRPC wires preserved with lists asJSONarrays; policyreads project small fields. No tests claimed by planner.
- Resulting state / acceptance: Implementation brief accepted; SQL/runtime coders assigned exclusive ownership; independent tester assigned current schema/runtime acceptance. Root copied historical adapters into test-only fixtures and removed scheduled-summary scripts; Docker default becomes metadata discovery.
- Remaining work and handoff: Stop/remove summary service after preserving Miro/discovery database variables, implement/test017 and runtime, independently review, apply/delete approved records and verify catalogue/source/Miro boundaries, deploy metadata worker and update current guides. No provider/model calls needed.
