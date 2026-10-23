Current isolated-tool follow-up corrections: initial context exposes only queue-reference/count coverage for exact current saved originals. Checkpoint bookkeeping reuses an existing exact task without completing omitted queue inputs. Named runner sync results retain name/call ID/origin/arguments/result through follow-up transcript reset; fragmented partial results remain partial and cannot complete action receipts. These are local bookkeeping/result changes, with no added source fetch or workflow dispatch.

# Autonomous update agent

The current attendance repair preserves each original speaker, exact map occurrence, human edits and existing participation. A successful own-author lookup is required; unmatched speakers keep their firm intent pending without an invented person. Model results and live release status are tracked in [the milestone](../../milestones/milestone.md).

A narrowly scoped task-read improvement is under verification after a real model run exceeded the conversation size limit by rereading unchanged task snapshots. Repeated exact fully delivered snapshots may acknowledge the earlier read; changed or incomplete snapshots still need full delivery. Full private originals/history, source and task authorization, action proof and existing limits remain required. New participation rows also require explicit start and end choices before any grouped write; existing rows retain omission-based preservation. This prevents a timing label from silently inheriting the wrong event start. The new guard is under verification. Initial completion accepts explicitly declared action/deferral and no-change lists as a validated union; it never adds an unlisted original, and current task/write completion checks remain mandatory. No new deployment is claimed here.

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
  Staged requests publish exact run/phase reference bindings so the model can
  copy short queue/task refs instead of UUIDs. Only wrapper inputs, the three
  task tools' follow-up taskId and queue finish fields translate; canonical UUID
  compatibility, atomic validation and all underlying guards remain. Maps come
  only from claimed inputs/authoritative task snapshots, stay fixed for their
  phase and never expand from task bodies or tool results. Raw model proposals
  remain intact; execution and receipts use exact UUIDs. Legacy mode is unchanged.
  A staged reply mixing exactly one finish with otherwise valid visible calls
  executes none of them, spends their existing call budget/IDs and returns fixed
  feedback to resubmit the ordinary calls before a separate finish. Invalid
  schemas/scopes, multiple finishes, protocol errors and legacy mixtures stay
  fatal. Recovery neither splits calls nor waives task completion proof.
  A staged follow-up reply with multiple participation patches for the same exact
  event is also rejected before any preparation/reservation/dispatch, spending
  existing call budgets/IDs and returning fixed group-or-wait guidance. Compatible
  people use one patch; separate dependent patches wait for the prior applied
  revision. Distinct-event batching, raw proposals and legacy behavior remain
  intact; the handler never merges, reorders, rebases or repairs proposed IDs.
  Staged finish/defer descriptions distinguish successful changes, genuine
  unfinished actionable work and directly handled no-change/already-satisfied
  inputs. Confirmed no-action needs no write or new task; the task cache is
  pending work, not a processing receipt or audit/archive. Existing saved tasks
  retain their unchanged action-proof/version requirements. Initial finish alone
  accepts optional noChangeInputIds: explicit no-change decisions partition its
  handled originals against private exact-source applied-write/current-durable-task
  coverage. Missing coverage returns bounded queue refs before projection/finish;
  duplicate, foreign, unhandled or positive-coverage overlap is invalid. Reads,
  lookups, unrelated wrapper peers, no-ops and Calendar projections do not cover
  originals; no-change remains a model decision, not semantic proof. Normal follow-up
  finish now returns bounded remaining task refs if current-cycle known-target
  participation work lacks a complete current task read and resolution or a
  private verified stop reason. Rejected finish consumes the existing budgets;
  it performs no provider reads or automatic actions. Unknown-person and old
  untouched tasks remain pending without blocking finish.
- `adapters.js` provides the trusted principal, source authorization and tools.
  Construction performs no network I/O. `resolveClaimSourceIds` refreshes eligible
  Discord IDs before each claim and adds only the explicitly allowed Gmail source.
  Initial source-writer coverage records only definite created/updated/cancelled
  provider receipts tied to the initiating exact native source identity/snapshot;
  cleanup removes it. No general read or wrapper-scope receipt grants coverage.
  Optional private getPersonIdChoices returns copying help only when defer_task
  has a sole invalid present personId and all other schema/scope fields pass.
  Separate feedback receipts plus actual ready lookup call-ID/stage/scope/result
  evidence bind the already-disclosed ID to this run, principal and exact native
  author/source/snapshot. Follow-up requires a complete current task read. No
  lookup/provider/roster or saved-history scan, enum, person ref, correction or new
  identity authority is introduced; phase/run/cleanup invalidate feedback only.
- `prompt.js` defines initial/follow-up responsibilities and legacy compatibility.
- `participation.js` validates complete target snapshots, merges person-only patches and compares applied readback without exposing private raw rows. Relative timed endpoints use existing event instants; no source-text parsing or catalogue editing.
- `local-time-display.js` adds derived local clocks to worker Calendar/Member Plans read results only when an explicit valid boundary timezone exists. Raw boundary objects remain unchanged; hints are not writable source fields.
- `staged-pipeline.js` orchestrates initial Calendar updates, deterministic API
  projection and at most10follow-up model turns, retaining actual outcomes.
  Saved-task reads and their fragment chains require the owner task in scope
  and the exact version. Only complete contiguous delivery grants a new task
  read proof; same-owner retransmission cannot advance that proof, and completed
  same-version read/action windows survive rereads. Generic API fragments keep
  their existing behavior. Wrong owner/version/offset returns fixed safe repair
  feedback and no task bytes. A private local participation proposal preflight
  uniquely matches selected current tasks to each changed person/own native URL.
  Missing full reads reject the whole validated reply before preparation,
  reservation or dispatch, with only advertised task refs/versions and already
  disclosed current contiguous fragment offsets (or root-read instructions).
  Normal call IDs/budgets are spent; no proof or authority is granted. Actual
  provider targets/source/identity/CAS checks still run after full reads.
  Current known-target participation obligations
  stay latched when a task's fields are rewritten. Only matching current-version
  backend observations can permit stopping for actual external blockage or a
  freshly verified no-op; these never resolve tasks or grant write permission.
  Successful matching dependency reads revoke those stop reasons across peers,
  including recovery read under an unknown/old task, without granting peer proof.
  Actual intervening parent drift after a validated write attempt may stop;
  model-guessed/stale CAS and our own prior patches cannot. Persisted history keeps metadata for backend-verified pending-task fragment chains without copying task bodies back into their own history; source/API/business records, unknown legacy chains and live outputs stay intact. For tasks actually created in this cycle, only a trusted current-cycle batch_context.inputs copy is narrowed to the task's own full native input rows. The full info.inputs, observed context, source/API results and precomputed source/reference metadata remain intact. Updates and finish checkpoints retain that scope; preexisting tasks and older/unknown/malformed history are not rewritten.
- `calendar-sync.js` projects the pinned club/Member Plans calendars using fixed
  building aliases and preserves independently sourced people and human edits.
  Its no-op comparison treats valid event/participant starts_at, ends_at and
  reported_at spellings as equal only at the exact supported microsecond instant.
  PostgreSQL +00:00 and equivalent provider Z spellings alone cause no write or
  revision bump. Missing/null/invalid values, date-only fields, time_zone and all
  source/human facts remain exact. Outgoing fields and CAS tokens are untouched;
  genuine changes still follow normal authorization/private carry/write guards.
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

For a manually whitelisted run, each existing policy/catalogue pair now consumes
one fresh `getAuthorizationSnapshot` from the manual Discord facade. Opening and
final checks call it separately; ordinary stores retain their separate reads.
Handler authorization frequency, live metadata/ancestor checks, exact source
bindings, identity receipts and final policy comparison remain unchanged. The
snapshot is never cached across boundaries, tools or model rounds.

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

The local generalized conversation prompt is held after actual-model timing/completion failures; no new worker rollout. See milestones/general-conversation/ for limits.

October23 bounded candidate removes duplicated pre-tool live authorization while preserving immediate post-reservation checks for source/business tools. Exact local task reads/deferral/fragments retain lease/principal/version/scope guards without unrelated provider scans. After an actual ready initial-finish verdict matches every immutable claimed UUID and deterministic projection succeeds, only model messages restart with the same follow-up context/reference bindings; partial/capped/hookless/unvalidated runs retain their prior messages. The full private initial execution/task/native/source/API/fragment/receipt state remains intact. Follow-up notices do not assume initial transcript visibility; manifest ordering favors current-cycle participation without dropping eligible tasks. Acceptance status remains in the milestone.

October23 candidate: per-request tool schemas offer exact already-disclosed queue/task IDs when a phase has1–20choices. Follow-up choices use its task snapshot; larger/empty catalogues retain base schemas. Only ID-specific validation feedback repeats those choices. This helps copying; it never supplies a successful task read, current version, identity or action proof. Existing runtime guards remain decisive.

The October23 native-evidence candidate fills only a missing patch-local observation timestamp from the exact fully read task original. It never changes shared observed-source state or complete/conflicting observations. The same source-bound identity receipt, current live author/body/time verification, task version, full snapshot, optimistic write and readback completion proof remain required.

The October23 preservation candidate lets the verified participation patch and
ordinary deterministic Calendar projection carry existing hidden human chat
attendance without granting chat source access. The map service privately owns a
single-use capability for the exact existing parent/revision and protected
people; normal model map reads/upserts remain filtered and strict. Participation
still requires each changed person's original, linked identity, current saved
task and applied/readback proof. Its ordinary authorized read retains partial
coverage checks. The private Calendar facade serves both rolling-window and
exact outside-window projections; assembly happens after visible API arguments
are formed, so hidden attendance never enters retained task/API/model history.
Protected business/provenance facts survive; an incompatible new Calendar window
defers instead of clipping or deleting a person. Relationship audit timestamps
may be regenerated by the existing SQL replacement.

The coverage/local-clock candidate reconciles each queued original against its
own applied action, saved genuine remaining task or confirmed direct no-action
state. Ready attendance still needs a separate task when its map action belongs
to follow-up. Contextual volunteered availability is an offer; abstract ability
and explicit exclusions retain the no-action rules.

`local-clock-boundary.js` is a pure worker input converter. New/changed staged
Member Plans timed endpoints use localDateTime plus IANA timeZone without an
offset; gaps/folds and conflicting forms deny before reservation. Raw endpoints
are exact corresponding copies from an independently read same source-owned
plan, freshly rechecked. Read failures and attempted mutations invalidate copy
evidence. A private single-use prepared-object receipt binds canonical arguments,
principal, input scope, cycle and phase across the handler's preparation/execution
passes. Normal source/identity checks still run again. Omitted presence defaults,
all-day dates, club/legacy tools and shared Calendar client semantics are unchanged.
No model timestamp, flag, source key or idempotency key is preparation authority.


October23 isolated-tool implementation: source reads are separate operations; Calendar/Member Plans writes touch only their fixed Calendar; map tools use only map storage and previously returned snapshots. Task resolution checks already returned matching results and deletes only the exact saved version. `finish_batch` performs bookkeeping; the explicit user exception invokes registered `sync_calendars_to_map` as a distinct runner-originated call with its own result/audit/budget, never on a round cap or hidden inside a write. Workflows are documented in prompt.js and docs/update-agent-prompt.md.
