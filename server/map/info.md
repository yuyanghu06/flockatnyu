# Map roster utilities

`roster.js` derives first/last name fields from avatar filenames and proposes
Discord identity links using names only. No portrait pixels or facial recognition
are used. A complete bounded first-name search is required for an automatic link;
ambiguous, truncated, failed and username-prefix-only matches remain pending.
Initial-only labels such as Sean H always require identity confirmation.
Existing identities and manually supplied names are preserved. Two roster rows
cannot claim one Discord identity. A missing surname may be filled only from an
unambiguous two-token server nickname whose first token agrees.

`discord-roster.js` reads the configured Tech@NYU guild with the existing bot. It
uses at most100member search queries, each capped at100results; no full directory,
bot edits or intent changes. Requests enforce fixed origins,15second timeouts,
500KB streamed response limits and bounded rate-limit retries. Supabase reads and
patches only `map_people`, using server-side service credentials. Conditional row
patches preserve existing/concurrent Discord links and surname edits; unique
database constraints resolve cross-process identity conflicts.

Run `node --env-file-if-exists=.env scripts/map-roster.mjs` to review a plan.
Explicit `--apply` writes unambiguous links; `--output=/tmp/<new-file>.json` saves a
minimal candidate review with mode0600 and refuses existing files. Names and IDs
in that file are private operational data; do not commit it. Partial failures
report successful, skipped and failed rows separately. This tool does not deploy
anything, activate tracking, or assign a person's physical location.

`events.js` supplies the shared trusted normalized-event store and service.
`events` holds one activity occurrence, `event_buildings` links every applicable
fixed building, and `event_people` links canonical trackable roster identities.
The service-only `map_read_events` RPC returns all event states, including past
and cancelled records needed for reconciliation. Limits are100buildings,
500people,2000events,20000rows per relationship and16MiB total; overflow fails
instead of truncating. Fixed HTTPS origin, private credentials, streamed response
bounds, cancellation and a maximum 60-second deadline apply to all event requests.

The service exposes database-only event reads, exact linked Discord/email
roster lookup and complete optimistic event replacement through `map_upsert_event`.
Provider URLs stored on map rows are attribution, never instructions to fetch
those providers. Current server-owned source UUID grants, local canonical-link
checks and fixed field/window rules govern visibility. `source-access.js` checks exact source-to-provider bindings: Discord source UUIDs
are tied to the current published database catalogue's guild/channel, and fixed
Calendar/Gmail source UUIDs cannot be reused for another provider. It never calls
Discord, Calendar, Gmail or live Miro content. For saved Miro references, explicit
reads additionally load the enabled board/source/team registry through the
Supabase-only `miro_authorized_board` metadata RPC. Browser readers await the
same metadata scope. The resulting synchronous checker is retained in the
private read receipt; writes reuse it without another metadata request.
Legacy unmarked provider-authorizer callbacks are not dispatched by map tools.
Safe profiles never include provider identity enrichment fields.

An explicit map read returns its usual public fields plus an internal symbol
receipt that is absent from JSON/model output. The receipt binds the service,
principal/source/binding scope and immutable complete database snapshot. A write uses
that locally held snapshot for catalogue/source/revision checks, then calls only
the database upsert transaction. It does not reread storage, look up a person,
fetch an original or perform a readback. An update without the current local
read receipt returns `read_required`; the agent must choose a separate map read.
The existing database transaction finally enforces fixed catalogues, source
identity, lease fencing and optimistic concurrency. Creates without a local
snapshot still rely on those transaction constraints. Read responses preserve
only authorized provenance; browser responses omit provenance entirely.

New timed scheduled events with known starts and missing ends use start+7200
seconds. New explicit current presence reports may use report+7200 only when
start equals the original report and is not future-dated; delayed processing
never refreshes the expiry. Personal plans, all-day dates and unknown starts do
not borrow this default. Explicit ends win. Complete updates missing a known
end are rejected rather than resetting it. SQL optimistic tokens protect state
concurrency; source chronology remains an evidence/prompt responsibility because
migrated legacy event report times may be event-start proxies.

`presence.js` supplies the read-only `/api/map/presence` browser projection from
these normalized relationships, with no legacy JSON fallback. An active confirmed
event with going participation places each trackable person at every linked
building. One person may appear at multiple buildings. Within one building,
overlapping activities produce one avatar, a deterministic caption, the union
of active time intervals and safe per-activity details. Participant-specific
arrival/departure overrides inherit event boundaries and must remain inside the
event. Future participation appears only in upcoming schedules. Named-timezone
all-day dates use real local midnights, including daylight-saving changes;
unknown/cancelled/superseded windows do not populate maps.

Projected responses are bounded to50000upcoming entries,2000events and500people
per building, and16MiB total; overflow returns unavailable rather than truncating.

Building event lists include all normalized event kinds with known unexpired
current or future windows, including personal_plan and presence activities.
Personal activities require at least one authorized, trackable, nondeclined
participant whose effective window has not ended before their stored title and
portraits can be shown. Scheduled events may remain visible without attendees.
Tentative events remain visible, while tentative/declined participation never places avatars.
Attendee portraits require independent event and participation authorization.
Only trackable roster names and person-bound same-origin avatar proxy paths (or
legacy safe local avatar paths during rollout) reach browsers. Labels
remain verbatim plain text, including blank labels and literal angle brackets,
with200Unicode code points maximum. No provenance, private linked identities or
inferred activity text is sent to the frontend. Unavailable/unconfigured data
returns a bounded503 path rather than fabricated empty success; existing member
authentication and no-store API behavior remain.

Three exact nonproduction local-development fixture scopes remain separate:
Bobst planned-person fixtures, the owner's explicit three-building plans and
Bobst events with original bobst-ui-debug-v1- source-record and [UI TEST] name
prefixes. Each event and participant must qualify independently. These are not
general runtime source grants, and production never uses them.

`contracts.js` documents agent-facing structured records and policies; the shared
map tools consume the trusted service. Tool registration, worker enablement and
external deployment are distinct integration steps. This module never deploys,
activates workers, edits the building catalogue or changes source permissions.

Overlapping activity captions use the newest authorized active participation with
a nonblank label. Newer blank or whitespace-only attendance labels do not hide an
older supplied activity; all-blank records remain blank. Supplied nonblank wording
is preserved verbatim, and denied, expired or future participation cannot supply
a current caption. Caption recency uses each participant's reported_at independently
of the event's report timestamp; equal participation timestamps retain stable event
ordering. Ranking stays private to the projection. Event names are never used to
infer activity labels.

`event_types` is the immutable activity-classification catalogue, independent of
presence/personal_plan/scheduled_event kind. The user-selected codes are study,
meeting, event, social and other. Strict snapshots include at most100validated
catalogue rows with unique codes/icons and known event.type_id references; a
missing catalogue or unknown reference fails closed. Trusted reads always return
the full safe catalogue even when event filters match nothing. Browser event
types contain only code, name and iconKey from validated metadata, never icon
URLs. New direct-service writes default an omitted type to other; updates preserve
the existing classification when omitted. Agent tool arguments require an explicit
existing type, grounded in evidence, other when unknown and preserved on unrelated
edits. There is no catalogue mutation tool or additional building/profile authority.

The user subsequently cancelled event icons. The five-type catalogue and required type_id remain;028icon_key/APIiconKey are reserved compatibility metadata and do not cause frontend images or remote requests. All current/future authorized event kinds remain in building cards, with private personal-plan participant gating.

Calendar provenance validates the configured allowed Calendar source UUID and exact canonical event link using local configuration and the principal's current grants; it performs no Calendar read. Both agent adapters bind Calendar record identity to the observed eventId; attendance uses separate authorized originals. Worker identity receipts bind changed participants to exact original author/sender evidence; chat uses its verified Discord speaker or a supplied unambiguous roster name through the normal map tools. Building/profile/type catalogues stay fixed.

not an authorization gate or an attendance parser. Chat interprets ordinary
first-person/named-person event attendance with read_map_events,
lookup_map_person and upsert_map_event, preserving the existing event snapshot,
other participants and fresh revision. It asks for unclear identity/event details
and carries supplied facts through normal conversational clarification. Only an
applied normal mapWrite receipt confirms marked going, not physical arrival.

`chat-attendance.js` now contains only chatAttendanceOrigin and
chatAttendanceReference. source-access.js uses them to validate historical stored
#attendance links against exact event/person/source bindings in the supplied
database snapshot and current local grants. No attendance resolver, separate write service or lexical declaration
parser remains. Existing stored links retain their compatibility checks.

Browser projection and trusted event reads apply local source checks to the
read's validated database snapshot, principal and cancellation signal. Event and
participant relationships remain independently scoped; malformed, cross-event or
cross-person attendance declarations fail locally. Each explicit read fetches a
fresh snapshot. No provider request concurrency or cached provider authorization
is part of a map operation. The shared storage/operation deadline remains60seconds;
shorter configured budgets and caller cancellation remain effective.

The shared record prompt explicitly creates source-backed map-only presence or
personal-plan events when no stable source record exists. It resolves fixed
buildings and linked authors first; trusted creation assigns the event UUID.
Explicit current-report ends override freshness defaults, future intervals stay
upcoming. Unqualified same-day until-time availability uses report time as its
planned start; explicitly delayed/future missing arrivals remain unresolved.
Hypothetical feature examples are not location evidence. Chat intent/identity
and current source-access gates remain unchanged; see `docs/events.md`.

`avatars.js` reads private `map-avatars` objects through the server-only Supabase
service credential. Profiles store exact configured-origin HTTPS authenticated
Storage references: `map-avatars/<person UUID>/<64 lowercase hex>.png`. The
sanitizer turns these into `/api/map/people/<UUID>/avatar`, preserving that bound
proxy through repeated safe-person sanitization; storage references, keys and
provider errors never reach the browser. Legacy safe local portraits remain
compatible during rollout. No arbitrary external avatar URLs are fetched.

The authenticated avatar GET reads only the exact trackable profile, then its
strict person-bound object with redirects disabled. It accepts PNG content type,
signature and an initial IHDR with dimensions1–4096, verifies SHA256 against the
immutable object filename, reads at most4MiB, bounds
profile JSON to16KiB, and shares a15second deadline/caller cancellation across
both requests and queue wait. At most four operations run concurrently; a FIFO
queue admits at most64waiting requests, and only queue overflow returns immediate
unavailable. Queued cancellation/deadline removes the waiter without upstream I/O. A fetch ignoring cancellation retains its slot until it
settles. Responses are private/no-store, nosniff and inline. Missing, disabled or
invalid profiles/paths return generic404; upstream failures return sanitized503.
The exact loopback development GET exemption rejects browser cross-site requests
and remains disabled in production.
Bucket provisioning and existing-profile migration are separate operator work;
this module creates no buckets, profiles, storage writes or public policies.

Map operational diagnostics preserve deadline/caller cancellation, storage HTTP and response-validation causes while retaining existing result statuses, SQL conflict/validation mapping and authorization behavior. Fixed codes and observed numbers only are forwarded; provider bodies, URLs, identities and raw errors remain excluded.

Presence projections include the actual event kind. `event-preview.js` grants only the exact reserved two-hour Go Greek UI fixture a nonproduction/local-development display exception; no participants or normal source read/write permissions follow. Production excludes this fixture. See docs/active-event-indicators.md for identity, expiry and guarded cancellation.




Calendar source authorization accepts explicit trusted pinned targets, including Member Plans. Automation uses an optional getLeaseToken store hook to route map writes through041 transaction fencing. Personal associations retain independently checked original Discord/Gmail provenance; arbitrary Calendar metadata cannot invent identity.

## Chat map tool authorization

Authenticated chat uses the existing map operations without source-content proof or phrase-matching gates. `source-access.js` exposes a small application-origin reference for internally attributed chat updates, enabled only in the web/Discord runtime. Other providers remain separate callable tools; worker source/identity interpretation is handled by its prompt and locally observed tool results. The normal event service still validates fixed catalogues, timestamps and optimistic revisions. Model prompts decide conversational intent and missing details; no separate report grammar, pending cache or resolver/save modules remain.

Chat no longer has a keyword detector that injects a map-write command. The model interprets the actual request, quotations and clarification. An applied normal map write exposes a bounded submitted snapshot, explicitly not an independent database readback; omitted defaults/relationships stay unknown. After a confirmed optimistic conflict, the chat runner permits one repeated read of that target per request while preserving mutation deduplication, budgets and normal authorization.

The October23 service preserves an existing trackable participant whose internal
chat attribution belongs to the same configured Calendar occurrence, even when
the worker cannot read that participant's source. `preparePreservedEvent` uses
only the private receipt from a previous explicit map read: it compares the
complete saved target with the authorized view and binds eligible hidden rows to
a single-use capability. It does no database or provider request. The subsequent
`upsertPreservedEvent` uses the ordinary local validation and one conditional
write, carrying those hidden rows unchanged. Raw hidden fields and capabilities
never enter model JSON. A readback is a separate explicit operation; applied
receipts attest the successful database transaction, not an automatic reread.
Participation mode preserves parent/building facts; the separately named Calendar
synchronization operation may use calendar mode for the same occurrence.
