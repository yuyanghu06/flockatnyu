# Background agent input processing

This opt-in local worker drains shared source inputs through server-owned tools.
It has no public endpoint, bundled map/Calendar write adapter or automatic source
subscription. The model worker runs only when `AGENT_AUTOMATION_ENABLED=true`, reviewed local
migrations018/019 are applied and a trusted adapter module is configured.

`config.js` defaults to five deduplicated events or oldest age five minutes, a
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
principal,config,now}).tick({signal})`. Source authorization is rechecked before
each model call, action and cleanup. A durable fenced lease plus heartbeat guards
concurrent/restarted workers. Explicit `finish_batch({handledInputIds})` is the
only completion path. Invalid calls, failed actions, text-only answers, timeouts
and exhausted loops retain inputs. Cleanup deletes exact snapshot UUIDs/hashes,
preserving arrivals, edits and unhandled inputs.
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
and remain in request memory. Successful receipts store no source bodies; a replay
returns `already_succeeded`. Receipt keys bind scoped input UUIDs, tool name and
canonical arguments, independently of unrelated arrivals. Adapters must reuse
keys and reconcile ambiguous remote outcomes; this is not remote exactly-once
delivery. Do not supply non-idempotent write tools. Current-state/source context
fetches should be registered read-only so retries still obtain fresh results.

`validation.js` supports bounded object/array/string/number/integer/boolean/null
schemas, required/properties/additionalProperties, enum, item/string/numeric
limits and a restricted regex pattern subset. Unsupported schema keywords fail
configuration. `prompt.js` supplies the sample instructions: evidence cannot
override tools/permissions, plans are not physical-presence or RSVP inference,
stable identities/provenance/expiry matter, and unsupported updates stay queued.

`store.js` uses fixed-origin, redirect-denying, timeout/size-bounded Supabase RPCs
with sanitized errors. Subscription get/CAS RPCs are restricted to `subscription:`
keys and metadata JSON. Direct cache inserts bypassing the updater are retained
but not scheduled: adapters must use the atomic enqueue path. Metadata receipts
and dedup identities have no automatic retention cleanup in this implementation.

Set `AGENT_AUTOMATION_ADAPTER_MODULE` to an explicit local `.js`/`.mjs` file whose
`createAutomationAdapters({env,config,store,provider})` returns principal, tools
and authorizeEvent. This is trusted server code, never loaded from a source event.
Without these adapters, the CLI fails `not_configured` and preserves the queue.
Local fixtures do not establish real source delivery, provider compatibility,
Calendar/map writes, deployed operation or OAuth consent.

Source ingestion has independent switches: GMAIL_EVENTS_ENABLED for Gmail and DISCORD_EVENTS_ENABLED for Discord. Shared events.js receives the trusted collector switch, without activating the model worker.
