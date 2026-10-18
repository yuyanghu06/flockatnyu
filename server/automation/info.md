# Update agent input processing

The update agent is the backend autonomous processor. This opt-in local worker drains shared source inputs through server-owned tools. The conversational assistant is the chat agent; module paths and configuration keys retain their existing technical names.
It has no public endpoint, map/memory writer or automatic source subscription.
The model worker runs only when `AGENT_AUTOMATION_ENABLED=true`, reviewed
migrations018/019 are applied and model/source/Calendar configuration is ready.
The bundled adapter supplies live Miro/Gmail/Discord reads and narrowly scoped
Calendar reconciliation. This local implementation does not activate a worker
or establish OAuth consent, live Calendar access or deployed operation.

`config.js` defaults to thirty eligible deduplicated events or oldest age thirty minutes, a
one-minute cooldown, one lease, twenty inputs/64KiB per claim, six model rounds,
twelve calls, a ninety-second run bound and America/New_York worker time.
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

The actual handler prompt also embeds `../map/contracts.js`: exact seven-field
`people_here` entries and flat `scheduled_events` records, with shared machine
schemas and synthetic examples. People updates require linked provider user identity; events require stable
provider event/source identity without requiring a person or attendee lookup.
Both require fixed building lookup, current-state reads, source-timestamp interpretation,
supported expiry and faithful activity labels (unknown activity stays blank).
The user-approved two-hour default applies only to explicit current self-reports
without an end, from the original provider timestamp. New location confirmation
can refresh it; partial/activity-only edits cannot. Explicit ends override it,
expired delayed reports are not resurrected, and future plans/events cannot use
that presence freshness policy. A separate operator-approved two-hour timed-event
default fills only a missing end with a supported start; explicit source
ends/durations override it and partial edits preserve known ends. All-day events
use exclusive date boundaries instead; unknown or ambiguous starts defer.
Current self-reports, future plans, events, RSVPs and help responsibilities stay
distinct. Corrections preserve unrelated state; partial/missing sources do not
justify deletion or cancellation. The default bundled adapter has no map tools;
actual provided trusted tool definitions determine callability. No tools are
registered by this prompt:
actionable map work stays pending until suitable tools exist. Runtime writes are
still limited to people_here; scheduled_events has no runtime write grant.
The existing mandatory Calendar/Miro preparation is unchanged by prompt work.

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
catalogue for each configured authorized Miro board. Board/team identity and
current allowed source UUIDs are checked before and after retrieval. At most
eight configured boards and one page of50frames each are accepted; explicit
cursors and coverage remain. All frame identities, titles, positions and geometry
are visible together; original listing metadata is retained losslessly. Total
preflight context exceeding64KiB fails explicitly instead of silently omitting
boards or text. Frame catalogue completeness never means full-board completeness.
The model follows relevant frame items/relationships with the provided tools;
this90second worker does not claim to scan an entire large board every run.

Calendar tools target only GOOGLE_CALENDAR_ID. Calendar writes require successful
batch preparation, a currently authorized board/source pair, and actual live item
provenance observed through a source read during this batch. Frame catalogue
metadata alone does not enable a write. Source keys and original item URLs are
checked server-side; calendar-client independently enforces target, account,
scope/ACL, idempotent managed event identity and human-edit preservation. No
Gmail/Discord-based Calendar writes, invitations or other Google mutations are
exposed by this adapter. Miro sync remains independent of these per-batch reads.

Source ingestion has independent switches: GMAIL_EVENTS_ENABLED for Gmail and DISCORD_EVENTS_ENABLED for Discord. Shared events.js receives the trusted collector switch, without activating the model worker.
