# Supabase schema

This folder contains immutable applied SQL migrations and migration guidance. The current hosted schema retains seven service-only public tables:

- `discord_view_policies`: Discord policy and channel/thread metadata catalogue.
- `knowledge_sources`: Miro and other non-Discord source registry.
- `miro_boards`: original board objects/layout/relationships and sync metadata.
- `agent_input_cache`: temporary input buffer with exactly `uuid` and `raw_response` JSONB.
- `agent_automation_state`: metadata-only queue/lease/action receipts and Gmail watch/history or Discord committed-session checkpoints.
- `map_buildings`: stable selectable map location catalogue and validated reported/planned-person JSON arrays.
- `map_people`: avatar-backed person identities, first/last names and optional name-matched Discord identities; no source memberships.

All force RLS and deny direct browser access. Backend source scope and administrator checks remain; per-person membership tables are retired. Source bodies belong only in the explicitly authorized Miro snapshot or temporary input buffer. Discord originals and summaries are read/generated live in request memory, with no durable archive/vector/fallback tables. The independent Discord Gateway collector writes scoped new events into the temporary cache, without restoring historical archiving.

Migrations013–017 record the historical storage/membership retirement and single Discord catalogue cutover. Migrations018/019 add shared temporary inputs and separate metadata state. Hosted018/019 versions are `20261017182014` and `20261017182143`; their definitions and service-only permissions have recorded independent verification. Earlier SQL must remain intact for audit and migration fixtures, even where later migrations remove its objects.

Local filenames and hosted migration receipts have different prefixes. Read [migrations/info.md](migrations/info.md) before deliberate schema work; never replay this directory with ordinary `db push`, and never apply schema at service startup. SQL alone does not install collectors, run an LLM, enable cleanup or grant source access.

Runtime clients use server-only Supabase credentials; developer MCP OAuth is separate. No key may use `VITE_`, enter browser code or be printed. Exact successful snapshot IDs control cache cleanup through the trusted automation handler; Gmail receipt alone does not mean an input was processed. See [current tables](../docs/database-tables.md), [automation](../docs/agent-automation.md) and the [milestone snapshot](../milestones/milestone.md) for evidence and operational limits.

Migration020 is applied as20261017184647. It preserves explicit manual Discord disables through discovery using existing channel JSONB. Table/column/ACL boundaries, source UUIDs, unrelated data and other functions were verified unchanged.

Migration021 is applied as20261017194715. It adds only map_buildings/map_people,26avatar identities,9locations and five service-only invoker helpers/RPCs. Existing table metadata/functions are verified unchanged; initial location arrays empty. Forced RLS and denied browser grants verified. New receipt text was corrected to match the immutable local SQL exactly after an apply-helper string-escaping defect; executed DDL was not replayed or changed. Verification contains counts/hashes/grants, not member-directory contents, under evidence/map-people-schema.

Migration022 is applied as20261017202855. It narrows only map_buildings service-role ACLs to SELECT plus UPDATE(people_here); catalogue fields/insert/delete remain owner-controlled, and timestamps are trigger-managed. All map rows, other table metadata and existing public function definitions are verified unchanged. Live service-role mutation probes were rolled back. See evidence/map-building-write-scope/hosted-verification.json.

Migration023 is hosted as20261017203512. It adds required label text to presence JSON via an updated validator and ordered blank-label backfill; only that validator and the column comment change. Five existing Bobst fixture labels were explicitly set to Test without changing original expiry or other fields.022 fixed-catalogue permissions remain unchanged.

Migration024 is hosted as20261018000104. It adds the bounded flattened
map_buildings.scheduled_events JSONB array and validation, with nine empty defaults.
The existing service-role people_here-only write grant remains; events are
owner-controlled, read through the backend with current source policy. Exact
receipt and data/function/ACL/RLS preservation evidence is under
evidence/map-building-activity/. No event ingestion or write adapter is activated.

Hosted025 adds optional validated attendee_ids arrays within existing building event JSON; no separate event table or runtime write grant. Existing people/current presence preserved; see database guide and aggregate attendee receipt.
