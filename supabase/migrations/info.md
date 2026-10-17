# Current migration boundary

Applied001–020 are immutable. Hosted020 is20261017184647_discord_manual_channel_disable;018 is20261017182014 and019 is20261017182143.020 updates two existing invoker functions and adds manual-disable intent only inside existing catalogue JSONB. It creates no table, column, archive or new grant. Independent actualSQL tests and hosted preservation fingerprints are under evidence/m36-collector-cleanup.

Never replay this directory with ordinary db push: local and hosted version prefixes differ. Apply only reviewed new migrations deliberately, verify receipts/definitions/access and preserve unrelated data. Historical notes below are superseded where013–020 remove the described structures.

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
