# Update agent and Gmail events

The **update agent** is the backend autonomous processor. The user-facing conversational assistant is the **chat agent**. Existing automation module paths, commands and configuration keys retain their technical names.

## Current agent prompt behavior

The user's autonomous planner is the existing update agent. Chat behavior and source routing are in [chat-agent-prompt.md](chat-agent-prompt.md); the autonomous prompt is in [update-agent-prompt.md](update-agent-prompt.md). Defaults now permit sixteen model rounds and thirty-two tool calls within a three-minute run bound, so required source reads, identity resolution, map writes and explicit completion can fit. The thirty-input/oldest-thirty-minute trigger, one-minute cooldown, five-second polls and disabled-by-default worker remain.

A trusted completion check prevents finish_batch from clearing inputs while required Calendar window pagination or actual-occurrence map projection remains unfinished. Exact source/occurrence identity, original timestamps and linked participation still apply. Calendar-to-map requires its own allowed AGENT_CALENDAR_SOURCE_ID; Miro remains read-only, Calendar mutations remain scoped to supported managed Miro/Discord club-event originals, and direct personal chat assertions cannot invent identity. Configured-model verification uses synthetic sources and inert write adapters; operational activation is separate.

## Synchronization contract

Calendar is the scheduled club-event view. Clear authorized Discord event
announcements or changes and concrete Miro plans feed reconciliation into the
fixed Calendar. The map projects Calendar occurrences and separately holds
informal studying, co-working, presence and personal plans. An RSVP changes
participation on the matching event; it does not create a new Calendar event.

Miro remains a read-only planning source. This is source-to-Calendar-to-map
reconciliation, with separate Discord participation, rather than bidirectional
Miro editing. Preserve human Calendar edits, stable provider identities and
source links. Ambiguous matches or conflicting sources stay pending. Actual
implementation and model acceptance are recorded in the milestone snapshot.

## Local implementation and boundaries

Migration018 creates `public.agent_input_cache(uuid, raw_response)` only. The raw
JSON can represent Discord, email or other provider events. Migration019 adds a
separate service-only metadata table for queue identities, leases, cooldowns,
successful-action receipts and mailbox checkpoints. Source bodies remain in the
cache. Hosted018/019 are verified at versions20261017182014 and20261017182143.
001–017 stay immutable and must not be replayed with ordinary db push.019
committed despite an API400; its missing history receipt was restored only after
independent exact-schema verification. Prior tables/data/functions are preserved.

The source updater is `createEventUpdater` in server/automation/events.js. It
stamps receipt time, requires a backend-owned source authorizer, derives a stable
UUID from source/event/revision identity and atomically deduplicates enqueue.
New revisions are new immutable entries. It does not install a Discord Gateway
listener. Existing Discord live-only read tools and policy enforcement are intact.

`createAutomationHandler` in server/automation/handler.js claims a bounded batch,
prepares fresh authorized Miro context, builds the update prompt, executes registered tools and deletes only explicitly
finished snapshot UUIDs. Empty, young, cooldown and busy queues make no model
request. The default trigger is 30 eligible queued inputs OR oldest age 30 minutes,
a one-minute cooldown and one active leased run. Discord messages/events and Gmail emails count together toward this threshold. The trigger count is separate from the existing per-claim cap of 20 inputs/64KiB. `serve` checks every five seconds.
The 30-minute threshold is measured from the oldest eligible pending input, not from the last run or fixed clock times. An empty queue never triggers model processing. Collection does not use an LLM.

`server/automation/prompt.js` defines source interpretation and Miro-to-Calendar reconciliation. It treats source text as evidence, preserves identities/time/provenance and defers unsupported work. Stated location plans/help responsibilities remain distinct from confirmed presence.
No RSVP inference or claim of verified physical location is introduced.

## Tools and running the update agent

Use the existing server-only LLM settings and opt-in environment variables in
.env.example. The bundled `server/automation/adapters.js` supplies trusted source checks, read tools, fixed-target Calendar tools and mandatory per-batch Miro preparation. An optional trusted local `.js`/`.mjs` override selected by
`AGENT_AUTOMATION_ADAPTER_MODULE` exports
`createAutomationAdapters({env,config,store,provider})`, returning a server-owned
principal, current source-policy authorizer and tools. Each tool supplies name,
description, an argument schema and its actual executor. See
[the module guide](../server/automation/info.md) for exact contracts.

Calendar tools require GOOGLE_CALENDAR_ID, additional Google Calendar consent and verified writer/owner access. Normalized map event writes are implemented; durable memory remains unavailable and unsupported work stays queued. Missing required runtime/source configuration fails closed. Source IDs in cache JSON never grant access. Authorizers
must recheck current allowlists/provider policy. Keep credentials in ignored
environment files or service secrets, never in adapter output or source payloads.

```
npm run agent:tick
npm run worker:agent
npm run test:agent-automation
```

Only successful actions followed by explicit `finish_batch` permit successful
processing cleanup. Separately,036 expires matching quarantined raw snapshots
after24hours; expiry never reports successful processing.
Tool adapters must support the provided stable idempotency key and reconcile an
ambiguous remote outcome. Source/context reads should be refreshed on retries.
Source bodies and tool result bodies are not copied into receipt metadata. Pending
inputs survive errors, unknown tools, incomplete model turns and exhausted bounds.
Metadata receipts remain; no extra source archive or embeddings are created.

## Bounded queue recovery (036)

Each input has a fixed maximum of five failed attempts. Failed mixed batches and
unhandled partial completions are deferred five minutes, then retried individually.
An input enters quarantine only after a singleton failure reaches the cap. A
healthy input therefore gets its own attempt before quarantine, even if its
original batch failed. Fresh batches and eligible retry singletons alternate while
both lanes have work; the30-input/oldest30-minute aggregate trigger,60-second
cooldown, configured per-claim count/byte caps and source scope remain unchanged.

Queue metadata records only a fixed outcome code, attempt count, retry timing and
snapshot hashes. Failure callbacks require the current unexpired lease token and
settle at most once. The next scoped claim accounts for an expired lease once and
uses the same isolation rules. Explicit caller shutdown defers without counting a
failure; an internal configured run timeout counts as `timeout`, and heartbeat
loss as `stale`. The public handler still returns `aborted` for cancellation and
internal deadline aborts. Completion deletes only explicitly handled, unchanged
source/hash snapshots; remaining inputs are isolated and deferred. Changed
snapshots cannot be deleted or have failures charged by stale work.

Quarantined raw bodies stay only in `agent_input_cache` for24hours from quarantine.
Each scoped poll/claim performs maintenance before returning empty/busy/cooldown,
removing at most100 expired matching bodies per call and retaining minimal metadata
for deduplication. No model call is needed for maintenance. Replacement bodies with
a changed hash/source are preserved under `quarantine_changed` for private service
review; their retention is not governed by the old snapshot's24-hour deadline.
This introduces no general pending-input purge, and applying036 itself deletes no
existing records. While the worker is stopped, maintenance waits until scoped
polling resumes.

Recovery is an explicit service-only operation, absent from public/model tools:
`store.requeue({inputId, allowedSourceIds, expectedHash})` calls
`agent_automation_requeue(p_input_id, p_allowed_source_ids, p_expected_hash)`.
Use the exact quarantined UUID, the current configured source UUID allowlist and
the stored MD5 hash of `raw_response::text`. Recovery requires an unexpired
quarantine, matching metadata/raw source IDs and hashes, and no active lease. It
resets attempts while retaining singleton isolation; expired/changed snapshots
cannot be requeued. There is no assistant-facing quarantine retrieval. The legacy
unscoped claim RPC loses service execution permission in036; the production store
already uses scoped claims. Apply the reviewed migration before deploying this
runtime; local implementation/tests do not establish hosted rollout.

Action receipt keys and adapters retain their existing identity rules. An identical
input subset/tool/argument tuple reuses its receipt, but splitting a former action's
input group changes that key. Regrouped writes must still reconcile stable source
identities: Calendar IDs derive from calendar/source keys, and map writes preserve
source identity and optimistic revision checks. Receipts alone do not promise
exactly-once remote writes. No new mutation retries bypass these adapters.

## Gmail subscriptions for techflock

The standalone Gmail service exposes `/healthz` and authenticated
`POST /webhooks/gmail`. It verifies Google's OIDC signature and exact
invoker/audience before accepting notifications, then reads Gmail history and full
bounded message JSON into the shared cache. Mailbox cursor/lease/watch metadata
uses subscription-prefixed state. The initial watch begins at its returned
baseline; it does not import earlier mailbox history. Source scope is explicit.

Set these non-secret configuration fields alongside existing Google/Supabase
server credentials:

- `GOOGLE_PUBSUB_PROJECT_ID=techflock`
- `GOOGLE_PUBSUB_TOPIC=projects/techflock/topics/tech-nyu-gmail-events`
- `GOOGLE_PUBSUB_SUBSCRIPTION=projects/techflock/subscriptions/tech-nyu-gmail-push`
- `GOOGLE_PUBSUB_AUDIENCE`: exact public HTTPS webhook URL/audience.
- `GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT`: exact configured push identity.
- `AGENT_GMAIL_SOURCE_ID`: stable UUID explicitly included in the shared source allowlist.
- `GMAIL_EVENTS_ENABLED=true`, only after setup and policy are ready; independent of the agent switch.

A project administrator must enable Pub/Sub/Gmail APIs, prepare the topic and
allow `gmail-api-push@system.gserviceaccount.com` to publish to that topic. Configure
an authenticated push subscription for the public callback, matching its exact
OIDC audience and service-account identity. The Pub/Sub service agent needs token
minting permission on that push service account; grant only the required scope.
The deployment image is deployment/gmail-events/Dockerfile. No cloud resources
are created by adding these files.

```
npm run gmail:status
npm run worker:gmail
npm run gmail:watch
npm run gmail:sync
```

The server's serialized reconciliation loop checks every five minutes and renews
the Gmail watch daily. It preserves pagination/cursors and bounded fingerprint/offset progress within
large pages on failures and restarts. An expired
history cursor returns `resync_required`. Oversized full messages fall back to raw
metadata with event type `email_received_metadata`, requiring an authorized body
read before body-based actions. Failed metadata fallback or deleted-before-fetch
mail retains the cursor for retry/operator resolution. The original
headers and MIME parts remain raw JSON; decoded-text interpretation belongs in
the later prompt/context adapter. The service adds no mail sends, mark-read,
Drive modifications or Calendar writes.

Operational status on2026-10-17: the user-enabled Tech@NYU Chrome profile
confirmed successful techflock topic, scoped IAM and authenticated subscription
creation. Hosted018/019 and exact receipts are independently verified. Railway
service gmail-events is live on revision79247d6f-c10f-4642-9371-540a3cee14d9:
health200, unsigned/forged notifications401, real signed Pub/Sub callback200.
The Gmail watch is active, expiring2026-10-24T18:23:50.852Z, with daily renewal
and five-minute reconciliation. Source UUID:2fa17434-212d-408d-ab20-448f8c2c5907.
Callback: https://gmail-events-production.up.railway.app/webhooks/gmail.
The user’s test message was received as one full email_received cache entry at
2026-10-17T18:34:20.688488Z with the correct source UUID. The mailbox checkpoint
advanced successfully and is ready without an active lease. No message body or
sender details were copied into verification logs.

Initial live notifications failed at a non-string historyId. The final handler
supports exact positive safe-integer numeric wake-up IDs alongside lossless string
IDs; unsafe numbers remain rejected and trusted Gmail history responses alone
advance the cursor. Canonical Base64 and Base64URL notifications are accepted.
Fixed-reason/type diagnostics exclude content, headers, identities and tokens.
Final local integration113/113 passes; independent focused41/41 and review pass.
No LLM worker is active; collection does not execute map/Calendar tools. Concrete
trusted adapters and collaborative prompt tuning remain follow-up work.

References: [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push),
[Gmail history synchronization](https://developers.google.com/workspace/gmail/api/guides/sync),
[authenticated Pub/Sub delivery](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

## M36 collector deployment update

Discord and Gmail are independently deployed thin ingestion services sharing the pending cache and metadata state. Native Discord creates and a real Gmail email have been observed in the queue. Discord ingress uses the eligible guild catalogue except inherited blacklists/manual disables, independently of assistant read scopes. Its startup never backfills message history. Collection does not invoke the inactive agent. Migration020 (hosted20261017184647) only preserves manual channel-disable intent in existing JSONB; no prompt/memory table was added.

Implemented: callable tools grouped by capability under tools/, development utilities under scripts/, and independent Gmail/Discord ingestion switches. GMAIL_EVENTS_ENABLED controls Gmail collection; AGENT_AUTOMATION_ENABLED controls model processing.

Still planned: independently deployed chat agent and update agent processes sharing tool code; agent-owned short/long-term context through update_memory, with core instructions operator-controlled. No memory migration or memory tool has been implemented.

## Per-batch Miro and Calendar behavior

Each eligible claimed batch must perform trusted Miro preparation after authorization and lease acquisition, before the first model call. Empty/waiting/cooldown/busy polls do not fetch boards or invoke models. Preparation failure releases the lease and preserves pending inputs. Fresh MCP navigation context is untrusted evidence and never certifies full-board coverage. Use MCP search followed by actual canvas calendar cells/headings or native table rows to establish event dates and meaning. Partial/skipped content and duplicate month frames remain explicit. No board content is stored; the old REST reader and snapshot worker are removed.

The bundled adapter reuses existing scoped source reads and bounds large results with ephemeral, batch-local continuation fragments. Successful partial/empty reads retain their original status/coverage. Calendar actions require actual MCP item or stable native-table-row evidence observed during the current batch, the authorized board/source pair and a canonical original link. Queue inputIds identify the triggering batch for Miro-only work; stable Miro sourceKey/sourceUrl record the actual evidence independently.

Calendar writes target only the configured calendar and managed source-based events. Re-read relevant calendar state, preserve human changes, and defer ambiguous dates or unsupported times; a supported timed start with a missing end uses the approved two-hour default, while explicit and existing ends take priority. No absence-based cancellation, RSVP/presence inference, attendees, source writes or durable-memory claims are authorized by this wiring. Local implementation and consent do not themselves deploy or enable the worker.

The runtime system prompt now imports structured people_here/scheduled_events contracts, synthetic examples and approved7200second current-presence/timed-event policies from server/map/contracts.js. See update-agent-prompt.md for exact limits, overrides, source-time semantics, label rules and test coverage. This does not register map tools, grant scheduled_events writes, remove Calendar preflight or activate the worker.

## Normalized map tools (2026-10-18; supersedes legacy map prompt/storage above)

The bundled adapter now registers read_map_events, lookup_map_person and upsert_map_event from tools/map. They share server/map/events.js with the map read path. Identity resolution is exact linked provider identity; write scope must match selected eligible batch input IDs and original source URLs, or observed live Miro evidence. Each participant carries independently checked provenance; unchanged participants may be retained after an authorized read, while removals require explicit participation state/end updates. New records receive approved deterministic two-hour defaults only where applicable. Optimistic conflicts remain failed actions and leave inputs pending. Hosted026/027now provide events/event_buildings/event_people and remove old building JSON/RPCs. The system prompt describes these actual contracts. Worker enablement, Railway deployment, pending Calendar sharing/preflight and a bounded real model pilot remain separate unfinished work.

Miro live-only cutover: both runtimes use the same official MCP reader. Migration030preserves only existing registry identity/status and enabled/team metadata, removing miro_boards and sync RPCs. Calendar writes retain their own fixed-target Google API tools and require current-batch concrete MCP evidence.

## Chat memory implementation (2026-10-18)

The previously planned long-term note is now implemented for the chat agent through agent_memory and read_memory/update_memory. It is proactively maintained from useful club context in any chat without explicit remember requests. This pass does not register memory tools in the update agent or activate its worker; its prior no-memory capability boundary remains until separately wired.

Production worker claims only configured shared source UUIDs using scoped RPC032. Outside-scope ingestion remains independent and deferred; it cannot trigger/starve valid work. This never grants source access or replaces fresh policy/ancestry checks. Deferred input retention is unchanged.

Live rollout pacing: five inputs per batch and configured600second maximum run, with unchanged16round/32call limits and fresh authorization. Library default180seconds stays unchanged; configurable ceiling is600seconds. The first20-input180second live pilot aborted safely and kept its inputs pending.

Optional AGENT_AUTOMATION_LOG_PROGRESS=true emits bounded safe phase/status/counter/registered-tool-name metadata. Source contents, IDs, arguments, URLs, results and private errors never enter logs. Default CLI final-status-only behavior remains unchanged.

## Backend Calendar traversal and map-read reuse

Agent-facing Calendar listings traverse provider continuation pages internally; model arguments do not include pageToken. Low-level client single-page reads remain available to bounded batch duplicate checks. The traversal retains bounded partial evidence when it cannot finish, and partial or filtered results cannot establish absence or full reconciliation coverage. Complete unfiltered full-mode subwindows may cover the reconciliation interval only without gaps. Completion feedback requests narrower unattempted windows after an incomplete scan.

The worker can read map records for the configured Calendar source once and reuse the returned complete snapshots across occurrences. Missing or stale observed projections need a merged upsert; an unchanged reread does not reconcile them. Conflicts require fresh state before retrying. Per-read source-original deduplication and bounded authorization concurrency reduce work while preserving later fresh reads and write-time checks. Current local verification and release status live in milestones/milestone.md.
