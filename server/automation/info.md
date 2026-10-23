# Autonomous update agent

This folder collects authorized provider inputs and runs the bounded update
cycle. The worker interprets cached Discord/Gmail messages for Calendar changes,
then source-backed people/location updates on appropriate existing map events.
It has no Miro construction, tools, preflight or per-batch board work. Shared
chat Miro modules are independent and unchanged.

## Modules and lifecycle

- `events.js` authorizes and deduplicates immutable source revisions into the
  temporary input cache. Collection does not invoke models.
- `store.js` calls fixed-origin service-only queue/lease/receipt RPCs.
- `handler.js` claims scoped inputs and keeps one leased, bounded processing run.
- `adapters.js` provides the trusted principal, source authorization and tools.
  Construction performs no network I/O. `resolveClaimSourceIds` refreshes eligible
  Discord IDs before each claim and adds only the explicitly allowed Gmail source.
- `prompt.js` defines initial/follow-up responsibilities and legacy compatibility.
- `staged-pipeline.js` orchestrates initial Calendar updates, deterministic API
  projection and at most10follow-up model turns, retaining actual outcomes.
- `calendar-sync.js` projects the pinned club/Member Plans calendars using fixed
  building aliases and preserves independently sourced people and human edits.
- `member-plans.js` validates/signs linked-person activity metadata. New personal
  plans and current presence originate in Member Plans, never worker map-only
  creation.
- `task-store.js` manages bounded service-only temporary tasks with exact-version
  completion, expiry and lease fencing. Task lists/reads use stored contents and
  current local source scope only; they do not reread Discord/Gmail originals,
  check reference URLs or perform Calendar preflights. Mechanical projection failures remain API
  outcomes; source interpretation/participation/ambiguous locations may need model
  follow-up. Existing unsupported work is not silently deleted.
- `bounded-result.js` transports large JSON results as batch-local lossless RAM
  fragments; `validation.js` enforces the supported bounded schema vocabulary.

The trigger remains30eligible queued inputs OR oldest eligible age30minutes,
with the existing cooldown, claim caps and run/tool bounds. Empty scopes still
perform bounded quarantine/expired-lease maintenance without selecting originals.
No empty-queue timer starts model synchronization. Irrelevant inputs can finish
without broad Calendar scans or map projection duties.

The update worker accepts at most16tool calls in one model reply and64calls in
each model phase, including finish_batch. Initial and follow-up counts reset
independently, for at most128accepted calls in a staged cycle. Configured lower
phase limits remain supported. Progress counts retain attempted-call semantics, including one rejected overflow
reply: at most144for staged processing or80for legacy processing. Rejected calls
are audited without execution. Progress emits at most320bounded events; rounds, deadlines, token limits and tool catalogue size are unchanged.
The worker passes a trusted maxToolCalls:16 parser option. Shared chat keeps its
usual8-call reply limit.

## Authorization and mutations

Non-Discord grants are explicit server settings. Discord UUIDs come from the
configured guild's current published eligible catalogue; blacklists, descendants,
manual disables, live permissions and exact bindings are rechecked. Legacy static
Discord IDs do not grant claims. Authorization is fresh at each boundary, not
cached across model rounds. The prepared principal and current lease fence writes.

Preparation verifies writer/owner access on each pinned Calendar, authorizes
inputs and builds bounded batch context. No external board configuration is
required. In staged mode its rolling Calendar window is used by deterministic
APIs, not a model completion obligation. validateCompletion only requires a
prepared authorized batch; the staged pipeline separately enforces task/phase
completion.

Club Calendar source keys are exact observed Discord message identities or
`gmail:<messageId>` with canonical original URLs. Gmail scope is registered only
after read_gmail returns actual bounded body text for the exact authorized queued
message, with a valid sender matching cached From headers when present. A fresh
body/sender/title/date reread must match before mutation. Metadata/search snippets,
foreign inputs, changed sender/body or revoked grants do not authorize a write.
Discord mutations also reread and match the current exact original and author.

The planner interprets natural event announcements without rigid club/event
keyword requirements. Narrow attendance/speculation/cancellation safety negatives
remain. Club upserts require a complete unfiltered full-mode prior Calendar
window covering the target start and preserve duplicate/cross-source conflict
checks. Calendar client independently enforces target/account/ACL, managed source
identity and human-edit preservation. Cancel only on clear current cancellation,
never deletion/absence. No invitations, attendees or arbitrary Calendar writes.

Map tools share `server/map/events.js`. Changed people require successful
source-bound identity receipts and independently authorized original statements.
Complete snapshots retain prior participants; explicit decline/end updates may
change participation. Optimistic conflicts require fresh reads. Follow-up writes
amend existing exact Calendar projections, preserving Calendar-owned event fields.
The non-staged compatibility path retains narrow observed occurrence validation,
without mandatory global projection bookkeeping.

Original timestamps anchor relative dates and current-report expiry. Explicit
current presence without end uses original start +2hours; partial edits do not
refresh it. Future personal plans need supported ends. Club known timed starts
may use approved +2hours only for a missing end, preserving existing ends.
All-day ends remain exclusive. Fixed people/buildings/categories are not editable.

## Tool, storage and operational contracts

Trusted tools expose `{name,description,parameters,execute}` with `readOnly:true`
or stable idempotent mutation handling. Ordinary model tools receive `{inputIds,arguments}`; finish_batch instead takes
`{handledInputIds}` and must run alone. Empty lists claim no handled input; staged
phases can advance with unfinished work retained, while legacy mode remains pending.
New and updated deferred tasks require summary and operation; context is retained
automatically. Only completed task resolution is advertised.
The executor receives the prepared principal, exact scoped IDs, idempotency key and
abort signal. Provider read tools fetch current state; pending-task reads return saved cache contents
and fragments return an earlier batch result. Receipts store no source bodies.
Regrouped input subsets change receipt keys, so stable provider identities and
optimistic writes remain necessary for replay safety.

read_pending_task returns the saved task from the service-only snapshot, using
local row/input/source-scope/expiry checks and a read-version receipt. Binding its
original inputs in memory is not a live observation or write grant. defer_task
bookkeeping also uses local inputs only: every supplied UUID must belong to this
cycle or an eligible task already read at its current version. Unknown/mixed IDs
cannot silently omit unsupported originals. Actual task saving and deletion keep
lease/scope/version checks. The model chooses the usual Discord/Gmail, Calendar,
person-lookup and map tools after reading. Those tools retain their normal live
permission, original identity and write checks; resolve_pending_task still verifies
actual confirmed work before deleting an exact version. Cache reads themselves
make no claim that originals remain current or readable.

Unsuccessful tool results, thrown preparation/execution errors, malformed results
and results over16KiB return one small tool_error response to the model with the
same call ID. Its reason comes from the fixed safe diagnostic list; failed tool
bodies and raw exception text never enter model or temporary task history. The
model may continue sibling calls and later turns. Failed writes never receive
successful action receipts, so a later valid retry uses normal stable identity.
Actual tool failures remain failures in operational diagnostics. Required model
audit failures, actual lease loss, global authorization/receipt failures,
whole-run cancellation/timeouts and argument/schema rejects still stop the run.
Tool-error handling does not alter deadlines or source checks.

Fragment results stay within16KiB envelopes, with a1MiB/32-result RAM ceiling.
Only actual returned fragment IDs/offsets may be read. Reconstruct full JSON and
preserve sourceStatus/coverage; transport-ready does not mean complete evidence.
Batch cleanup clears observations, identities, sources and fragments.

Queue failures isolate retries and quarantine after the existing bounded attempt
policy. Matching quarantined source/hash snapshots expire after24hours, with at
most100 removals per scoped poll. Replaced bodies are preserved for service
review. Maintenance is not successful processing. Service-only requeue requires
exact UUID/current source scope/hash and no active lease. See
[agent-automation.md](../../docs/agent-automation.md).

Private model audits retain durable pre-dispatch metadata and returned model
outputs for seven days; never prompts, uploads, raw source responses or secrets.
Progress diagnostics contain safe phase/status/tool counters only. Temporary task
context has separate bounded task semantics and is not audit retrieval.

`cli.js` uses this bundled adapter unless an explicit trusted local
AGENT_AUTOMATION_ADAPTER_MODULE overrides it. Disabled workers do not construct
adapters. Shared read-only Drive tools and the Tech@NYU Drive skill remain
available for relevant supporting context; reads do not create write provenance.
Release/schema/verification truth is in milestones/milestone.md.

Manual requests use manual-runs.js for bounded service-only metadata RPCs and validation, manual-worker.js for existing-worker dispatch, and the dedicated042forced scoped claim. A request runs one normal bounded staged cycle; no source history is fetched and ordinary trigger/budgets remain. Manual runtimes share audit maintenance with the base runtime.

manual-auth.js checks PLANNER_API_KEY for both manual start/status routes, using a timing-safe comparison of hashes. No cookie, source grant or worker budget is derived from the key. Missing/invalid configuration denies access.

Saved source-review tasks recognize confirmed club/Member Plans cancellations separately from creates/updates. Removal requires the exact task-bound original, pinned Calendar/event, successful cancellation receipt and fresh matching cancelled state; an explicit authorized already-absent receipt requires a successful exact empty read. Failed, partial, active or mismatched outcomes retain the task. Current release state is in the milestone.
