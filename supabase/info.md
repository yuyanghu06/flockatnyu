# Supabase schema

Native Contacts upgrade051 preserves provider JSON and raw sender cache, stores the original enrichment address separately, and unifies private search/duplicate/display field projection. Apply after047–050; existing email recovery requires explicit authorization.

Migration047 adds a private `contacts` CRM table with generated UUID `id`,
timezone-aware `created_at`/`updated_at` and one flexible `raw_input` JSONB object.
The database preserves creation time and advances update time automatically.
Only trusted service-role/database operations can read or change contacts; no
browser access, imports, contact tools or map-identity links are added. Hosted
application is verified as `20261026162857_contacts`; see the [milestone snapshot](../milestones/milestone.md).

This folder contains immutable applied SQL migrations and migration guidance. The historical018–020 schema retained these seven service-only public tables; later map/event and Miro overrides below supersede this list:

- `discord_view_policies`: Discord policy and channel/thread metadata catalogue.
- `knowledge_sources`: Miro and other non-Discord source registry.
- `miro_boards`: original board objects/layout/relationships and sync metadata.
- `agent_input_cache`: temporary input buffer with exactly `uuid` and `raw_response` JSONB.
- `agent_automation_state`: metadata-only queue/lease/action receipts and Gmail watch/history or Discord committed-session checkpoints.
- `map_buildings`: stable selectable map location catalogue and validated reported/planned-person JSON arrays.
- `map_people`: avatar-backed person identities, first/last names and optional name-matched Discord identities; no source memberships.

All force RLS and deny direct browser access. Backend source scope and administrator checks remain; per-person membership tables are retired. Current source bodies belong only in the temporary input buffer; Miro content is read live through MCP and never stored as a board snapshot. Discord originals and summaries are read/generated live in request memory, with no durable archive/vector/fallback tables. The independent Discord Gateway collector writes scoped new events into the temporary cache, without restoring historical archiving.

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

Current event storage supersedes the earlier021–025JSON descriptions:026is hosted as20261018170616and027as20261018171006. Nine source-backed events, nine building links and eleven participant links preserve all prior activity/attendees; old building JSON and obsolete RPCs are removed after two-way equivalence checks. Ten public tables remain. Map catalogue/profile data is preserved, source-only backend checks remain mandatory, and writes to normalized activity use service-only guarded RPCs rather than direct table DML. See docs/events.md and evidence/events-relationships/.

Current Miro override030 removes miro_boards and all snapshot/sync functions. Only metadata-only source identity/status/enabled/team scope remains in knowledge_sources; live content is fetched through MCP.

Current event classification028 is hosted as20261018173407_event_types. It adds the fixed service-readable event_types catalogue (study, meeting, event, social, other) and events.type_id; all nine existing events default to Other while original fields, times and relationships remain unchanged. Catalogue mutation remains owner-only; event writes select an existing type through guarded RPCs. Applied icon_key metadata is reserved and unused after the user cancelled category images. See evidence/events-relationships/event-types-hosted-verification.json.

Migration029 adds the service-only minimal bug_reports table and bounded append RPC for user-reported product bugs. Original chat report text lives only in its structured report JSON. No Discord archive/summary policy is changed.

Migration031 adds the minimal shared plain-text agent_memory note and scoped RPCs. Chat may maintain useful long-term club facts; this does not restore provider archives or summaries.

Migration035 stages Discord metadata refreshes separately from a proven published catalogue to prevent temporary bot outages during archive scans. It retains immediate observed revocations, policy/manual-disable/source-identity checks and service-only access. Existing incomplete generations stay closed until real completion. Tests exercise the full001–035chain with actual discovery/store/chat adapters. Applied as20261019193035 through the restored project-owner dashboard; source/function hashes and ACLs verified. Legacy scan completion and service-role base-channel/rollback-only refresh checks passed; see the milestone snapshot. The user subsequently confirmed that normal bot replies work after the repair.

## Go Greek retirement (046)

October25 owner-requested forward cleanup046 checks the exact popup identity under the existing map lock, removes exclusively linked activities/attendance and the popup link from shared events, then removes the catalogue row. Other events, people, catalogues, source originals and permissions remain intact. It is replay-safe, changes no schema/grants and does not modify historical037. Hosted application remains a separate operation recorded in milestones/milestone.md.

The incoming-sender staging schema is local migration049 contacts_cache: exactly UUID, creation timestamp and raw JSON object. It is separate from the normal Contacts CRM and is applied as hosted20261026215743_contacts_cache; current receipts live in the milestone.

Migration050 adds only the separate Contacts-cache enrichment service: private operational job/scope/lease/budget metadata and fixed RPCs that only read contacts_cache, then atomically insert raw Contacts and mark processing complete. Enrichment payloads never enter cache or tracking tables. It follows intake049; its local file/testing does not establish hosted application. See docs/gmail-enrichment.md and the rolling milestone.

Revised raw-only050 was applied as hosted20261026225556_gmail_contact_enrichment after independent local review. Hosted cache hash stayed exact for all28 original rows; metadata tables and Contacts remained empty after application. Service functions read cache only and atomically write raw Contacts plus typed completion metadata. Actual provider work is scheduled separately.

Migration053 adds only private Gmail send metadata and fixed RPCs; it does not modify Contacts, sender cache or original source records. Exact hosted version and preserved-row hashes belong in the milestone.
