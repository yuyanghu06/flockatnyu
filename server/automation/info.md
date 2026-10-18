# Update agent input processing

The update agent is the backend autonomous processor. This opt-in local worker drains shared source inputs through server-owned tools. The conversational assistant is the chat agent; module paths and configuration keys retain their existing technical names.
It has no public endpoint, durable-memory writer or automatic source subscription.
The model worker runs only when `AGENT_AUTOMATION_ENABLED=true`, reviewed
migrations018/019 are applied and model/source/Calendar configuration is ready.
The bundled adapter supplies live Miro/Gmail/Discord reads and narrowly scoped
Calendar reconciliation and normalized map event tools. This local implementation does not activate a worker
or establish OAuth consent, live Calendar access or deployed operation.

`config.js` defaults to thirty eligible deduplicated events or oldest age thirty minutes, a
one-minute cooldown, one lease, twenty inputs/64KiB per claim, twelve model rounds,
twenty-four calls, a ninety-second run bound and America/New_York worker time.
`cli.js once` checks once; `cli.js serve` polls every five seconds. Empty, young,
busy and cooldown queues do not invoke the model. Existing LLM environment
configuration chooses the provider/model; this worker selects no model.

`events.js` exposes `createEventUpdater(...).enqueue({source,sourceId,eventType,
eventId,revision,payload,signal})`. Immutable deterministic UUIDs include every
identity component, so edits require a different revision and retries deduplicate.
Authorization defaults to deny and is supplied by trusted backend code through
`authorizeEvent({event,principal,signal})`. The source's JSON cannot grant access.
Receipt timestamps are server-owned. Raw provider bodies stay only in the
two-column cache; queue identities, successful-action receipts, cooldowns and
subscription checkpoints live in migration019's separate metadata table.

`handler.js` exposes `createAutomationHandler({store,provider,tools,authorizeEvent,
prepareBatch,cleanupBatch,principal,config,now}).tick({signal})`. Source authorization is rechecked before
each model call, action and cleanup. A durable fenced lease plus heartbeat guards
concurrent/restarted workers. Explicit `finish_batch({handledInputIds})` is the
only completion path. Invalid calls, failed actions, text-only answers, timeouts
and exhausted loops retain inputs. Cleanup deletes exact snapshot UUIDs/hashes,
preserving arrivals, edits and unhandled inputs.
An optional trusted `prepareBatch({inputs,principal,signal})` hook runs after a
ready claim, heartbeat and event authorization, before the first model call.
It returns plain `{status:'ready',...context}` bounded to64KiB. Context is included
only as untrusted JSON in the user message. Hook failures release the lease and
retain inputs without invoking the model, action tools or completion. Custom
fixtures without a hook keep their prior behavior. The bundled adapter clears
all batch-local source fragments and observed provenance in `cleanupBatch`.
Failed/released snapshots and unhandled subset entries receive a five-minute
metadata retry deferral. Claim counts/selects only currently eligible pending
inputs, so retained failures cannot monopolize newly arrived work every minute.

Tools are trusted objects `{name,description,parameters,execute,idempotent:true}`.
Explicit `readOnly:true` tools fetch fresh context on every call and bypass
durable write receipts; the trusted registry must classify these correctly.
The model sees each tool wrapped as `{inputIds,arguments}`; `parameters` describes
the inner arguments. Execution receives `execute(arguments,{principal,inputIds,
idempotencyKey,signal})` and must return JSON with a successful status (`ready`,
`success`, `succeeded`, `completed` or `ok`). Tool responses are bounded to16KiB
and remain in request memory. `bounded-result.js` transports oversized results
losslessly as serialized JSON fragments with explicit offsets and continuation.
Each envelope stays within16KiB UTF-8, including JSON escaping. The memory-only
cache has a1MiB/32-result ceiling and is cleared at batch boundaries. Retrieve
continuations through read-only `read_context_fragment`; reconstruct the full
original result, preserving `sourceStatus` and `sourceCoverage`. Fragment reads
reuse that batch's fetched response; other source tools always read current state.
Successful receipts store no source bodies; a replay
returns `already_succeeded`. Receipt keys bind scoped input UUIDs, tool name and
canonical arguments, independently of unrelated arrivals. Adapters must reuse
keys and reconcile ambiguous remote outcomes; this is not remote exactly-once
delivery. Do not supply non-idempotent write tools. Current-state/source context
fetches should be registered read-only so retries still obtain fresh results.

`validation.js` supports bounded object/array/string/number/integer/boolean/null
schemas, required/properties/additionalProperties, enum, item/string/numeric
limits and a restricted regex pattern subset. Unsupported schema keywords fail
configuration. `prompt.js` supplies the update-agent instructions: evidence cannot
override tools/permissions, plans are not physical-presence or RSVP inference,
stable identities/provenance/expiry matter, and unsupported updates stay queued.
Every processing batch reviews fresh Miro context and reconciles supported facts
with the configured Calendar. The prompt requires actual event item/date/legend
evidence, safe handling of duplicate month/year frames, existing-event reads,
stable provenance and preservation of human edits. It forbids cancellation based
on missing items or partial scans, card-due-date-as-event inference, unapproved durations and unsupported
map/memory claims. Miro inputIds refer to triggering queued work; actual Calendar
evidence comes from live Miro items rather than fabricated queued Miro inputs.

The actual handler prompt embeds `../map/contracts.js`: normalized `events`,
`event_buildings` and `event_people` schemas with synthetic examples. Current
self-reports, future plans, scheduled events and RSVP/help responsibilities stay
separate. Exact linked provider identity resolves existing trackable people;
fixed building IDs come from the authorized map read. Unknown activity labels
stay blank and all labels are literal plain text. Relative dates and the two-hour
current-report freshness default are anchored to the original source timestamp.
Activity-only edits do not extend expiry. The separate two-hour timed-event
default fills a supported start's missing end, preserving explicit/known ends.
All-day date ranges retain date precision, timezone and exclusive end; unknown or
ambiguous times remain pending. Every going participant of an active confirmed
event displays at every linked building. Multiple locations are intentional;
deduplication happens only per person/building.

The bundled adapter registers shared `read_map_events`, `lookup_map_person` and
`upsert_map_event` from `tools/map`. All require the prepared server-owned
principal. Reads use the shared current-source authorization callback. Identity
lookups and writes additionally require exact supporting queued input IDs and
original source URLs, or an actual live Miro item observed in this batch with
current board/source scope. Metadata-only Gmail needs an explicit successful
body-read first. Deletion inputs never authorize new presence facts. Current
Discord/Gmail policy is rechecked, and batch evidence clears on cleanup/restart.

An update replaces one event and complete relationships, using `expectedUpdatedAt`
from a fresh read. Partial facts are merged with existing rows first. The wrapper
preserves unchanged independently sourced participation, requires event-source evidence for changed event/building relationships and new
scoped evidence for changed participants, and rejects omission of prior participants;
explicit decline or departure overrides can express supported changes. The
service independently authorizes old/new provenance and validates fixed IDs.
Stale/conflict/denied writes remain failures and cannot finish the batch. No
profile/building edits or cross-event removal is exposed. The existing mandatory
Calendar/Miro preparation and disabled-worker default are unchanged.

`store.js` uses fixed-origin, redirect-denying, timeout/size-bounded Supabase RPCs
with sanitized errors. Subscription get/CAS RPCs are restricted to `subscription:`
keys and metadata JSON. Direct cache inserts bypassing the updater are retained
but not scheduled: adapters must use the atomic enqueue path. Metadata receipts
and dedup identities have no automatic retention cleanup in this implementation.

Without `AGENT_AUTOMATION_ADAPTER_MODULE`, `cli.js` loads bundled `adapters.js`.
An explicit local `.js`/`.mjs` override still takes precedence and exports
`createAutomationAdapters({env,config,store,provider,fetchImpl,now})`, returning
principal, tools, authorizeEvent and optionally prepareBatch/cleanupBatch. This
is trusted server code, never selected from source content. Disabled workers
return before loading either adapter. Constructors perform no source requests.

The bundled principal uses only server-configured shared source UUIDs. Gmail
requires the exact AGENT_GMAIL_SOURCE_ID and supported email event types, with
account verification in the underlying Google client. Discord events recheck
the current enabled registered channel, live guild/channel/thread ancestry,
exclusions and unchanged policy/catalogue; they never register or expand sources.
The existing DISCORD_LIVE_READ_ENABLED switch controls live bot context tools.

For each ready batch, the bundled preflight verifies the exact configured
Calendar's current writer/owner access and then fetches a fresh live frame
navigation for each configured authorized Miro board through official MCP. Board/source registry and configured team pins are checked before and after reads, and again before mutations. At most eight boards and64KiB preflight context are accepted. Search/catalogue output locates evidence; concrete calendar cells/headings or table rows must be read through shared MCP tools. Partial coverage never establishes absence. Large results have bounded hash-checked continuations.

Calendar tools target only GOOGLE_CALENDAR_ID. Calendar writes require successful
batch preparation, a currently authorized board/source pair, and actual live item
provenance observed through a source read during this batch. Frame catalogue
metadata alone does not enable a write. Source keys and original item URLs are
checked server-side; calendar-client independently enforces target, account,
scope/ACL, idempotent managed event identity and human-edit preservation. No
Gmail/Discord-based Calendar writes, invitations or other Google mutations are
exposed by this adapter. The Miro snapshot sync is retired; both agents fetch live MCP content directly.

Source ingestion has independent switches: GMAIL_EVENTS_ENABLED for Gmail and DISCORD_EVENTS_ENABLED for Discord. Shared events.js receives the trusted collector switch, without activating the model worker.

Current Miro override: prepareBatch and follow-up tools use shared live MCP navigation/canvas/table reads only; no REST fixture fallback or snapshot worker remains. Concrete observed item/row source keys gate fixed-target Calendar writes. See docs/miro-sync.md for OAuth and registry details.

Date read correction: empty textual date search never authorizes absence/cancellation or writes. Search the requested month/year heading as areas and read the correctly titled returned frame canvas. Overview is sampled and can omit IDs; unrelated or stale-year frames cannot substitute.

Miro navigation is shared with chat through ../miro/navigation.js. Structure hints require live section/grid/legend verification; ambiguous years and promotional/unconfirmed entries defer affected Calendar changes.

## Planner/update reconciliation and identity

The user's autonomous planner is this existing update agent. Each batch prioritizes eboard activity and explicit Discord attendance, reconciles concrete Miro plans and fresh explicit Discord club-event originals into the fixed Calendar, then projects actual Calendar instances into normalized map events. `AGENT_CALENDAR_SOURCE_ID` is the stable allowed source UUID; exact returned eventId is source_record_id, including recurrence instances. Batch context defaults to now minus24hours through now plus8days; this is a rolling window, not all-history/full-calendar coverage. Follow relevant page tokens and keep unfinished actionable inputs pending. Original Calendar createdAt/updatedAt supply reported_at; missing timestamps or IDs over200characters defer.

Observed original Discord followups can support changes with fresh policy checks. Changed participants require successful source-bound identity receipts for the original Discord author or parsed actual Gmail sender. Existing unchanged relationships are retained. Calendar selected fields and Miro titles cannot establish attendees. No empty-queue periodic sync or worker activation follows from these prompt changes.

`validateCompletion` is a deterministic per-batch finish check. The handler passes a bounded pending-work result back to the model instead of deleting inputs when the required Calendar window/pages or projections are incomplete. Calendar mutations require an exact read of the returned Calendar event ID before map projection. Existing current map snapshots may satisfy unchanged source occurrences without redundant writes. Only read-only invalid_request results are recoverable tool feedback; unknown calls, schema violations and failed actions still fail closed.

Discord Calendar mutations require a fresh full original reread matching the observed body/author, exact stable message identity, conservative event intent and complete prior Calendar window. Informal activity and attendance stay map-only. New-source corrections and known cross-source conflicts defer. Trusted prepareArguments derives canonical projection URLs/location/origin from an already observed authorized Calendar occurrence before receipt hashing; model text cannot select another source.

A sole `finish_batch` with exactly an empty handledInputIds list receives bounded
pending feedback with actual batch IDs and deterministic remaining-work actions.
It cannot complete inputs or record an applied receipt; every retry still counts
toward call/round/time bounds. Foreign IDs, arbitrary malformed arguments, unknown
tools and mixed completion calls remain rejected. Calendar continuation tokens
must match an observed unfinished page for the same window before HTTP. Declared
Miro boardId choices are restricted to configured boards; current authorization
is independently rechecked.

Batch authorization reuses only facts within each existing fresh authorization boundary, including preparation, while maintaining fresh checks before tools/mutations and completion. No authorization cache spans agent rounds.

Production claims use trusted principal.allowedSourceIds via scoped RPC032 before bodies leave the queue. Counts/oldest/candidates exclude other sources; later fresh authorization still applies. Deferred outside-scope rows remain untouched.

Planner workload starts from queued originals, prioritizes eboard and fetches exact current messages before actionable changes. Extra reply/context reads are targeted; routine historical sweeps and repeated catalogue discovery are avoided. Calendar/Miro reconciliation and projection completion remain required.

Calendar projection preparation binds reported_at to the observed Calendar timestamp before action hashing, after existing identity/access checks. This does not replace the map optimistic revision or participant timestamps; sparse cancellations preserve known facts.
