## Manual planner API (2026-10-22)

POST `/api/planner/runs` accepts JSON `{}` or `{"channelIds":["DISCORD_CHANNEL_ID"]}`. Both start and status require `Authorization: Bearer <PLANNER_API_KEY>`. Set PLANNER_API_KEY privately on the web service to32–512 URL-safe characters. Website login cookies/admin sessions do not authorize these routes; callers do not need a cookie or Origin header. Missing/invalid server keys or missing/wrong request keys return403. Unknown fields, duplicate/malformed IDs, queries and more than30IDs are rejected. No lookback, history import, client source UUID, guild, model or budget parameters exist.

For example, after configuring the same private key on the server and in your terminal:

```sh
curl -X POST https://flock.techatnyu.org/api/planner/runs \
  -H "Authorization: Bearer $PLANNER_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"channelIds":["DISCORD_CHANNEL_ID"]}'
```

Use the same Authorization header when fetching the returned statusUrl. Never put the key in the URL, source files, frontend or logs.

The API returns202 with runId/statusUrl. Authenticated GET `/api/planner/runs/:runId` returns queued/running/completed/failed state, timestamps and a finite content-free result/counts. The existing worker checks durable manual requests before ordinary polls. A manual request bypasses the30-input/oldest30-minute threshold and cooldown, shares the existing global runner lease and runs one configured batch through the standard initial Calendar -> deterministic two-calendar map APIs -> bounded follow-up procedure. It waits/requeues if another cycle is active. Empty selected queues complete empty without invoking a model; retry backoff/quarantine and input/time/call limits remain.

Omitted/empty channelIds uses ordinary Discord blacklist plus explicitly allowed Gmail. A nonempty list selects only exact queued Discord channel/thread sources, excludes Gmail/unrelated task dependencies, and overrides configured channel/category exclusions for that run. Parents do not select descendants. Fresh bot permission, configured guild/ancestry, published metadata, manual disable/withdrawal, paused/discovery-disabled policy and final source/identity checks still apply. The stored blacklist/catalogue is never enabled or edited. Previously excluded channels may have no queued messages or stable source UUID; the route does not fetch history or invent inputs. Ordinary map visibility remains governed by its existing source policy, so excluded-source participant details can remain hidden outside that run.

042 adds FORCE-RLS metadata-only agent_manual_runs with24hour retention,20active requests and15minute fenced request reservation, plus a dedicated service-only forced queue claim.043 adds a read-only selected-node/ancestor metadata RPC. Tokens, channel selections and source/model bodies never appear in the public status response. Ordinary agent:tick and automatic triggering retain their prior behavior. Actual release status lives in milestones/milestone.md.

# Autonomous update-agent cycle

The update agent reads the temporary authorized Discord/Gmail input cache,
updates the corresponding Calendar activities and then associates source-backed
people/location with appropriate existing map events. It does not reconcile
Miro, scan boards or require broad model-driven Calendar/map upkeep for each
input. Chat's separate read-only Miro capability remains available.

## Processing stages

The existing trigger is30eligible inputs OR oldest eligible age30minutes, with
one cooldown/lease and unchanged claim, tool and run budgets. Empty queues do not
invoke a model. Fresh Discord source IDs come from the published eligible guild
catalogue; only the explicitly allowed Gmail source joins queue scope. Empty-scope
polls still perform bounded quarantine/expired-lease maintenance.

With AGENT_AUTOMATION_STAGED_ENABLED=true, one leased cycle runs:

1. The initial model interprets queued originals and updates the pinned club or
   Member Plans Calendar.
2. Deterministic Calendar APIs project actual club/Member Plans occurrences into
   map events, handling provider pages, fixed aliases, versions and safe retries.
3. At most10follow-up model turns resolve source interpretation, participation or
   ambiguous location tasks using actual execution/API outcomes. Successful
   follow-up Calendar mutations receive deterministic projection.

New personal plans/current presence still originate in the separate Member Plans
Calendar with verified person/source metadata. RSVPs attach to existing club
events. No worker map-only personal activity creation path is introduced.
Mechanical API failures remain actual diagnostics for deterministic retry, not
model instructions to repair broad projection. Irrelevant inputs can complete
without unrelated model scans or upserts. Legacy non-staged compatibility retains
narrow source/occurrence protections without mandatory rolling completion.

## Source safety and Calendar behavior

The adapter prepares pinned Calendar writer/owner access and current input
permissions; it requires no Miro service, board catalogue or navigation request.
Discord source access preserves blacklists, manual disables, descendants, exact
bindings and current live permissions. Non-Discord source UUIDs remain explicit.
Source text and cached context never grant permission or override instructions.

Clear club announcements/changes are interpreted semantically without mandatory
club/event/scheduling keywords. Calendar writes use exact observed Discord keys
or gmail:<messageId> and canonical original links. Gmail requires an authorized
read_gmail body for that exact queued input, valid matching sender and a fresh
unchanged body/title/date/sender reread before mutation. Metadata/search snippets
do not grant write scope. Discord writes reread unchanged exact originals/authors.

Before club upserts, read a complete unfiltered full-mode Calendar window covering
the actual target start, including dates outside the deterministic rolling
window. Preserve duplicate/cross-source checks and human-created/edited events.
Explicit cancellation affects only the same managed source event; deletions,
missing objects, absence and RSVP declines are not cancellation. Do not send
invitations, add attendees, create recurring events or mutate unrelated sources.

Changed map participants require successful exact source-bound person lookups
and independent original participation evidence. Existing people and Calendar-
owned fields survive complete-snapshot merges. Conflicts require fresh state.
Original provider timestamps anchor relative dates/current-report expiry. Current
presence without an end expires original start +2hours; partial edits cannot
refresh it. Future personal plans need supported ends. Club known timed starts
may use approved +2hours when end is missing, preserving existing ends. All-day
ends are exclusive. Unsupported/ambiguous facts defer rather than inventing data.

## Temporary tasks and tool results

Migration039 adds a bounded service-only task cache;040 supplies fixed building
aliases and041 fences worker map writes with the live lease. Tasks may retain
original input UUIDs/channel/speaker/timestamps, preceding context actually read
and actual agent/API results. This is temporary pending work, never a durable
source archive or assistant-facing operational-audit retrieval. Exact confirmed
resolved task versions alone are deleted; untouched/unresolved tasks survive
caps, errors and crashes. Mechanical projection outcomes do not create new broad
model-repair duties.

The task catalogue and `read_pending_task` use the saved database snapshot only.
They do not reread Discord/Gmail originals, open every retained source link or
preflight Calendar access. Saving deferred work also uses the bound cached inputs.
These operations still check the worker's current source scope, expiry, principal
and trusted input bindings locally; the database retains lease/version checks.
Reading a task does not supply a fresh source observation or identity receipt.
After reading it, the model chooses the normal Discord/Gmail, Calendar, map and
person-lookup tools needed for the work. Those tools retain their own permission,
original-message and write checks. Task resolution separately verifies actual
completion before deleting its exact saved version.

Ordinary tools take {inputIds,arguments}; use actual supporting queue/task UUIDs
and exact returned provider IDs. finish_batch instead takes bare {handledInputIds},
is the sole call in its turn and names only queue UUIDs. An empty follow-up list
settles no queued original. defer_task requires summary and operation even when
updating taskId; the runtime captures retained context automatically. Initial completion transitions stages; only confirmed handling or
durable task transfer permits queue settlement. Failed/unsupported work remains
pending. Lossless bounded fragments live only in batch RAM; coverage warnings
remain authoritative after reconstruction. Successful mutation receipts contain
no source bodies and do not guarantee remote exactly-once delivery.

## Running and documentation

Server credentials belong in ignored environment files/service secrets. Required
Calendar consent, fixed target IDs, allowed source UUIDs, Member Plans source and
private signing configuration remain server-only. Missing configuration fails
closed. No deployment or enablement follows merely from editing these modules.

```
npm run agent:tick
npm run worker:agent
npm run test:agent-automation
```

An explicitly configured trusted local AGENT_AUTOMATION_ADAPTER_MODULE may
replace bundled adapters; source content cannot choose implementations. See
[the module guide](../server/automation/info.md),
[prompt](update-agent-prompt.md), [private audit](model-audit.md) and the rolling
milestone for actual implementation, migrations and release evidence.

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

## Tool errors returned to the model

A tool that fails, throws an ordinary exception, returns null/malformed data or exceeds the result size limit returns a small `tool_error` with a fixed safe reason. The runner supplies it under the original call ID and continues other valid calls. Raw error text and failed response bodies are excluded. Failed writes do not receive successful action receipts; an unclear external write outcome requires checking actual state before retrying. Global cancellation/deadline, real lease/receipt failure, current run authorization failure and unavailable required audit storage still stop processing. Invalid model-proposed arguments remain a separate existing rejection path. Worker call limits are16per model reply and64per stage, including finish_batch; initial/followup stage totals reset independently (up to128across both). Shared chat defaults remain unchanged. Model rounds, overall deadlines and output-token allowance are unchanged.

Saved source-review task completion also recognizes actual club/Member Plans cancellation receipts. It confirms the task-bound original, pinned Calendar and exact event/person plus fresh matching cancelled state before exact-version removal. Explicit already-absent needs its own authorized receipt and a successful exact empty read. Uncertain, failed, active or mismatched results retain the task. This backend fix does not change plain-cache reads or model budgets; see milestones for release truth.

## Inbox sender Contacts cache

The Gmail collector now has a separate cacheInboxSender write between its authorized message fetch and existing event enqueue. It filters only this cache operation to explicit INBOX messages, excluding SENT/DRAFT/SPAM/TRASH, the configured mailbox itself and ambiguous/missing From addresses. Normal ingestion/watch/history scope remains unchanged. The private contacts_cache table has only id, created_at (date/time) and raw_input containing normalized email plus optional plain display name. It stores no mail body/header/source IDs in this table. Deterministic sender IDs and insert-ignore preserve the first row on retries. Cache failure keeps the current cursor/offset; fresh ownership checks bracket cache work. This flow does not promote records into Contacts or import old mailbox history. Hosted schema/runtime receipts and limits live in the milestone.

Calendar projection uses forgiving fixed-catalogue name matching for clear case,
punctuation, spacing and bounded spelling variants. Per the selected behavior,
unmatched locations have no building links and do not fail the whole sync.
Event/attendance data and unchanged manual placement remain preserved; known-to-
unknown moves clear stale building links through the ordinary versioned write.
Ambiguity and genuine provider/permission/conflict failures remain partial. See
[location repair evidence](../milestones/calendar-sync-location-fix-2026-10-27/verification.md)
for offline and read-only checks; no new production cycle is implied.
