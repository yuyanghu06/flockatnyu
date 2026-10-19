# Current migration boundary

Applied001–021 are immutable. Hosted020 is20261017184647_discord_manual_channel_disable;018 is20261017182014 and019 is20261017182143.020 updates two existing invoker functions and adds manual-disable intent only inside existing catalogue JSONB. It creates no table, column, archive or new grant. Independent actualSQL tests and hosted preservation fingerprints are under evidence/m36-collector-cleanup.

Never replay this directory with ordinary db push: local and hosted version prefixes differ. Apply only reviewed new migrations deliberately, verify receipts/definitions/access and preserve unrelated data. Historical notes below are superseded where013–020 remove the described structures.

Migration021 is hosted as20261017194715_map_people_buildings. It adds two forced-RLS/service-only map tables,26avatar identity seeds,9map locations and five invoker functions for validation, atomic updates and freshness-filtered reads. Discord links are a separate service-role data import; no messages or location claims are seeded. Its receipt statements exactly match local SQL after a guarded correction of newly recorded history text; no prior receipt or DDL was replayed.

# Ordered database migrations

Migrations 001–019 are applied to Tech NYU project jssehnrmqhstcrtxulpa. Applied
files are immutable. Hosted version numbers differ from local filename prefixes;
never replay this directory with an ordinary db push or from worker startup.
Apply only a new, reviewed migration and record its hosted receipt.

Migration018 is applied as20261017182014. It adds the shared
`agent_input_cache` input buffer with exactly two columns: `uuid` (UUID primary
key with a generated default) and `raw_response` (required JSONB). It accepts raw
provider JSON or an envelope containing source/event type/receipt time/payload,
without imposing a JSON schema. Forced RLS and explicit grants permit only
service-role CRUD among application roles; browser roles receive no access.
Future backend code owns source allowlists, ingestion, processing, retries and
cleanup. No subscription, retention timer, scheduler or automatic deletion is
implemented by this migration. Applying this schema alone does not enable
Discord content persistence or change the deployed live-only runtime.

| Local number | Purpose | Hosted version |
| --- | --- | --- |
| 001 | Original knowledge/source foundation | 20261011200346 |
| 002 | Original Discord archive and operator controls | 20261011200348 |
| 003 | Discovery, exclusions and raw grouping | 20261011205557 |
| 004 | Atomic raw group publication | 20261011213945 |
| 005 | Rebuild execution budgets | 20261011214737 |
| 006 | Historical summaries, provenance and accounting | 20261011232316 |
| 007 | Planning performance | 20261011233820 |
| 008 | Historical planning budget | 20261011235513 |
| 009 | Sliced planning and accounted recovery | 20261012003929 |
| 010 | Scoped SQL execution/lock budgets | 20261012023824 |
| 011 | Live-first, summary-only pipeline and summary vectors | 20261015203437 |
| 012 | New Miro board table and guarded sync/read RPCs | 20261015203824 |
| 013 | Retire 14 empty obsolete tables and old RPCs | 20261015230516 |
| 014 | Miro 12-column schema; original JSONB renamed data | 20261015230552 |
| 015 | Rename policy table to discord_view_policies | 20261015230959 |
| 016 | Shared source authorization; remove two membership tables | 20261015231144 |
| 017 | Live-only Discord; single channel catalogue table | 20261016003623 |
| 018 | Shared two-column source-input cache | 20261017182014 |
| 019 | Agent lease/cooldown/receipts and subscription metadata | 20261017182143 |
| 020 | Preserve manual Discord channel disable through discovery | 20261017184647 |
| 021 | Map location/person tables, avatar seeds and service-only presence RPCs | 20261017194715 |

The deployed schema through019 has five service-only, forced-RLS public tables:
discord_view_policies, knowledge_sources, miro_boards, agent_input_cache and
agent_automation_state. The backend owns source
scope and admin authorization. Migration017 consolidates all Discord metadata,
settings and checkpoints into the policy row, then explicitly deletes the16other
Discord tables and24summary functions. The user authorized deletion of summaries,
vectors, accounting and compaction history. Miro/non-Discord sources remain intact.

Only channel metadata discovery is scheduled for Discord. Original content is
read live through the bot and on-demand summaries stay in request memory.
Miro keeps its separate complete-board sync and guarded lease/configuration model;
it remains paused pending board scope and credentials.

Current cache/automation acceptance executes actual001–019. Independent hosted
verification confirmed exact018/019 definitions/ACLs and unchanged prior data,
schema and RPCs; do not replay001–019. Historical tests explicitly
bound earlier migrations and use test-only adapters. Cloud receipts and exact
catalogue/policy/checkpoint/Miro fingerprints live in evidence/m29-discord-live-only/.

Migration019 is applied as20261017182143. It keeps agent_input_cache at exactly two
columns and adds agent_automation_state(key,data) for metadata only. Service-only
RPCs provide atomic enqueue/dedup, bounded hybrid-trigger claims, lease renewal,
action receipts, exact snapshot cleanup and subscription-prefixed CAS checkpoints.
No automatic job, model call or source subscription starts by applying SQL.

019 returned an API400 after its explicit SQL transaction committed without a
history receipt. The cause is unknown. After independent exact-schema verification,
only the missing receipt was recorded with its complete original SQL. Both new
receipts match local files exactly; no prior migration/history was altered. See
../evidence/m35-gmail-subscription/hosted-migrations.json.

Migration022 restricts service-role writes on the fixed map_buildings catalogue
to UPDATE(people_here). Table-wide INSERT, UPDATE and DELETE, plus explicit
column UPDATE grants, are revoked before granting only that presence column.
Existing SELECT, invoker RPCs and browser-role denial remain unchanged; the
validation trigger still maintains updated_at. This local migration does not
create agent tools or change any building or presence data. Hosted application
and verification must be recorded separately before claiming it is deployed.

Migration023 adds a required `label` string to each people_here JSON entry,
allowing 0–200 Unicode code points without trimming or a generated fallback.
It replaces only the existing map_validate_building function, retaining all
prior presence validation and trigger-managed timestamps. A bounded backfill
adds `label: ""` only where missing, preserving entry order, existing labels and
all prior fields. Migration022's people_here-only runtime grant is unchanged;
no catalogue columns, new functions or agent tools are introduced. Hosted
application and fixture label updates are verified separately by the orchestrator.

023 is now applied as20261017203512. Exact receipt/file hashes and preservation of people/catalogue/other functions/ACLs and all prior presence fields/order/times are recorded in evidence/map-presence-labels/hosted-verification.json.

Migration024 adds only map_buildings.scheduled_events and its bounded flat-event
validator/trigger. It preserves the022people_here-only runtime write boundary;
service_role can read events but cannot update them or the fixed catalogue.
Required/optional event fields and presentation policy are described in
../../docs/database-tables.md. All nine arrays default empty.

024 is applied as20261018000104 via the exact-project Supabase Management API,
with its receipt in the same transaction. Transaction assertions preserved all
existing map rows, public functions and table ACL/RLS. A subsequent read confirms
receipt/local-file equality, NOT NULL JSONB default, validator, forced RLS, denied
browser reads and denied runtime catalogue/event writes. Evidence lives in
../../evidence/map-building-activity/. Do not replay prior migrations with db push.

025_map_event_attendees.sql is an additive validator revision for optional attendee_ids arrays (<=500 unique existing map_people UUIDs), preserving legacy events and owner-only event writes. See rolling snapshot for actual hosted application status; do not assume a local file is applied.

025 is now applied as hosted20261018001815_map_event_attendees. Owner verification confirmed exact validator body MD5 and absent runtime event-write grant; aggregate receipt lives in evidence/map-building-activity/attendee-migration-receipt.json.

## Dedicated activities and relationship cutover (026–027)

026 creates `events`, `event_buildings`, and `event_people` with forced RLS,
service-role SELECT only, and two postgres-owned SECURITY DEFINER RPCs with an
empty search_path. Discord source UUIDs remain independent of knowledge_sources.
`map_read_events(p_at)` returns a complete service-only snapshot, including
expired/cancelled records for reconciliation; display filtering and fresh source
policy checks belong to the backend. It fails above 2,000 events, 20,000 of either
relationship, 500 people, 100 buildings, or 16 MiB rather than truncating.
`map_upsert_event` atomically replaces an event's relationships. A null expected
timestamp is create-only; updates require an exact `updated_at`, and source
identity is immutable. Conflicts use PostgreSQL code 40001. Application roles
cannot write the new tables directly or execute the internal validation helpers.

026 preserves old JSON columns and backfills deterministic source identities.
Original start timestamps proxy for the previously absent reported_at; expiry
and labels never reset to migration time. Scheduled copies merge only when all
shared event fields and attendees agree; each building retains its location text.
All-day legacy timestamps must be midnight in their declared timezone, including
DST boundaries, so date conversion cannot silently discard time information.
Fixture source IDs and source-record IDs remain distinguishable. Presence records
use `legacy-presence:<hash(building/person/original start)>` identities.

027 requires exact two-way equality for every migrated event and relationship;
missing, changed, extra, or orphan converted records abort its transaction. Its
NOTICE gives verified event/building/person relationship counts. Only then does
it explicitly retire the old location RPCs, validator, and both `people_here` and
`scheduled_events` columns, without CASCADE. The remaining buildings catalogue
is runtime SELECT only. Profile guards use event_people and preserve identity,
trackability, and foreign-key protections. Prepare the application cutover before
applying 027, and do not resume old writers between the two phases. These files
are local until the orchestrator records an actual hosted receipt. Do not replay
older migrations. Real PGlite acceptance is in
`tests/events-relationships-sql.test.mjs`.

## Fixed event types (028)

028 adds the service-readable, forced-RLS `event_types` catalogue with exactly
five user-selected classifications: Study (`study`), Meeting (`meeting`), Event
(`event`), Social (`social`), and Other (`other`). Each code maps to a bundled,
whitelisted `icon_key`; the catalogue stores no SVG, remote icon URL, or attendance
assumption. Application roles cannot add, edit, or delete types. Classification
is independent of `events.kind` and does not change visibility rules.

`events.type_id` is a required foreign key with `ON DELETE RESTRICT` and default
`other`. Adding the column does not update existing events, fire their update
triggers, infer classifications, or alter their timestamps/relationships. The
existing snapshot RPC adds bounded `event_types` metadata and includes each
event's type. Its prior complete-snapshot limits remain unchanged.

The existing service-only, postgres-owned event-write RPC accepts an optional
string `type_id`. New writes that omit it use `other`; updates that omit it retain
the existing type. Unknown types fail the foreign key atomically, and explicit
null is rejected. The same optimistic version checks, source identity protections,
relationship replacement, fixed catalogues, and denied direct activity DML remain.
No type-management RPC or broader agent permissions are introduced. Applied
026/027 are unchanged. This local migration is not a hosted receipt; the
orchestrator records any reviewed hosted application separately. Actual SQL tests
are in `tests/event-types-sql.test.mjs`.

030 retires Miro board snapshot storage and sync routines, preserving existing source identity/status plus exact metadata-only enabled/team configuration in knowledge_sources.miro_scope. Earlier migrations and their historical SQL fixture harness remain intact.

029_bug_reports adds only bug_reports(uuid,created_at,report JSONB) and the service-only bug_report_record append RPC. Browser roles have no access and direct service DML is denied. Identical UUID/payload retries return a receipt; changed payloads conflict. Existing migrations remain unchanged. Hosted receipt: evidence/bug-reports/hosted-receipt.json.

031_agent_memory adds one forced-RLS agent_memory(id,content,updated_at) row and service-only read/optimistic-write RPCs. id is fixed to shared, text is bounded16KB, browser access/direct service DML are denied, and an empty note is seeded. No provider archive, embedding or history schema is added. Hosted receipt lives in evidence/long-term-memory/.

032 adds service-only scoped agent claims without modifying historical019functions or deletingpendinginputs; source-scope filters are identical for trigger/count/candidates.

Migration033 adds service-only agent_model_calls/agent_audit_events and fixed start/finish/event/prune RPCs. Model output retention is bounded to seven days, with no raw prompts/source tool response storage and no assistant retrieval. Existing migrations/data remain unchanged.

Migration034 changes only terminal audit pricing validation for complete short-context cache-write accounting. Applied033 and existing terminal records remain unchanged.
