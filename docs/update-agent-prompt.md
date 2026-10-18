# Update-agent prompting and event records

`server/automation/prompt.js` is the actual system prompt delivered by the
handler. It imports `buildMapRecordPrompt()` from `server/map/contracts.js`:
frozen machine-readable schemas, synthetic examples, evidence rules and approved
default policies. The current model uses `events`, `event_buildings` and
`event_people`; old building JSON contracts remain exported only for historical
migration verification. They are not the runtime storage model.

## Callable tools and structured records

The autonomous planner requested by the user is this update agent; the internal
chat retrieval planner remains a separate component. The unchanged default
trigger is thirty eligible deduplicated inputs OR the oldest eligible input
reaching thirty minutes, subject to the existing claim/cooldown limits. Each
claimed batch prioritizes queued eboard originals and uses native queued IDs.
Gateway ingestion supplies new activity; routine historical/channel sweeps are
avoided. Actionable changes require the exact current original, with narrow
reply/reference/event context when needed. It captures explicit
study/co-working/location/participation facts, reconciles
scheduled club events from concrete Miro/Discord evidence into the fixed Calendar, then projects actual Calendar
occurrences onto the map. Leadership exclusions remain backend policy, including
descendant threads. The prompt cannot grant source access or start a worker.

The bundled update-agent adapter registers `read_map_events`,
`lookup_map_person` and `upsert_map_event` from `tools/map/`. They share the trusted
service in `server/map/events.js`. Chat uses the same shared map tools through its
separate registration. Activation and deployment are explicit operational steps.
Current live readiness belongs in
the rolling milestone rather than inferred from prompt or tool availability.

An event has a stable UUID and source identity, name/notes, kind, fixed type_id, status, original
reported_at, timezone, and timed/all-day/unknown timing. Building relationships
use existing text building IDs; participation uses existing UUID person IDs,
attendance state, planned/reported basis, faithful label, independent source
provenance and optional individual timing. There is no primary building or
per-person building assignment. Every going participant in an active confirmed
event can display at every linked building. Simultaneous locations are intentional;
one avatar per person/building can represent several qualifying activities.

Read current state before updating. Existing records require their exact
updated_at token and a complete snapshot merged from current state plus supported
changes. Conflicts require re-reading; changing source identity to evade one is
forbidden. Unknown people must be resolved using exact linked provider IDs/email,
never name or portrait guesses. The agent cannot create/relink profiles or edit
building identities/names/aliases. Event and participant provenance are separately
authorized, including replaced relationships. Automation also binds mutations
and lookups to supporting selected input IDs/original URLs or observed authorized
live evidence. Follow-up Discord results must contain exact original message
IDs/URLs and the currently allowed channel source UUID; catalogue metadata cannot
support writes. The adapter remembers returned live originals only for that
batch and rechecks source access before use. Metadata-only Gmail requires a body
read; deletion inputs alone never support new facts. Missing/forged scope fails
before action completion.

## Calendar occurrences and source boundaries

Calendar is the canonical scheduled club-event view. The map mirrors actual
Calendar occurrences plus informal study/co-working/presence/plans that stay
map-only. Explicit attendance belongs on the same Calendar-derived map event,
not a duplicate informal event or a Calendar invitation.

Discord Calendar writes use `discord:<guildId>:<channelId>:<messageId>` and the
exact original message URL. Only authorized queued created/updated originals or
observed live originals register a batch-local server grant. Before mutation,
the adapter reads that exact original again through current live access checks;
source UUID, URL, author and original text must match and the result must be
explicitly untruncated. Changed/deleted/inaccessible originals defer rather than
using stale queued evidence. A fresh tool read may establish the new current
original for a later supported operation. Metadata/catalogue entries grant no
Calendar writes.

A conservative English-first guard requires an explicit club-event announcement
or supported same-source correction. Ordinary study/co-working/presence and
first/third-person RSVP or help statements cannot create Calendar events. Explicit
club study groups/events can schedule; uncertain, multilingual or unsupported
wording may defer. Cancellation requires an affirmative original cancellation,
not negation, uncertainty, quotes, deleted messages or declines. Underlying
Calendar ownership checks still restrict cancellation to the same managed source.

Discord creation requires a fully read Calendar window covering its supported
start; all-day starts use campus-local midnight, including DST. Repeated native
edits preserve the original message key and deterministic Calendar identity.
Correction terms such as rescheduled/moved/updated require an existing managed
event under that exact source identity, verified by a known read or an exact
deterministic-ID read. Known differently sourced matching events and links cause
conflict/defer, never title/date-only overwrites or parallel duplicates. Cross-source
Discord corrections to Miro-managed events remain deferred: persistent precedence
is not implemented, and stale Miro could otherwise revert them next batch. Separate
message cancellations without an established original identity also defer. Miro
remains read-only; no reverse board edits, invitations or broader source grants.

`prepareBatch` supplies a rolling reconciliation window from the trusted clock:
twenty-four hours back through eight days ahead. This catches currently active
overlaps and the upcoming week; it is not full-calendar/history synchronization.
After supported source reconciliation, read every Calendar page in that exact
window, retaining its pagination/partial coverage. Additional concrete windows
can be read separately. Failed pages, absence and partial scans cannot authorize
cancellations or a claim that all events have been synchronized.

Calendar map projection uses the server-configured `AGENT_CALENDAR_SOURCE_ID`,
which must be a valid UUID included in the effective shared source allowlist.
Missing/unallowed configuration marks `batchContext.calendarMap.configured=false`
and leaves those writes deferred. It never borrows a Miro/Gmail/Discord identity.
Each successfully read Calendar occurrence returns that source provenance and
keeps its exact individual `eventId` as `source_record_id`, including recurring
instances. The adapter rejects a different ID or source UUID, requires
an observed read this batch and checks the exact occurrence through the fixed
Calendar client again before a map change. Event IDs over200characters are
deferred rather than truncated to fit map identity storage.

The shared source authorizer accepts only canonical Calendar event URLs whose
decoded identity targets the configured Calendar, an exact configured/allowlisted
source UUID, and a trusted Google read grant or exact worker Calendar grant.
Current `readEvent` must return that exact ID/link. Provider failures, revoked
access, changed targets, missing events and aborted reads deny authorization.
Chat Calendar read tools attach source UUIDs only from trusted configuration and
the principal's existing allowlist; model arguments cannot supply them.

Actual human-created and agent-managed Calendar events both project from Calendar
provenance; managed events can retain their original supplied Miro links in
notes. Human-created entries never gain Miro source authority. Timed boundaries
and exclusive all-day date ends survive unchanged. Explicit locations may link
to existing buildings; unknown/off-campus locations stay unlinked with location
text in notes. No profile, building or catalogue creation is exposed.
Calendar selected outputs retain validated original `createdAt`/`updatedAt` from
both list and exact reads. The prompt uses updatedAt, falling back to createdAt,
for `reported_at`; absent/malformed provider timestamps stay unknown and defer
projection rather than becoming the processing time.

Selected Calendar fields do not establish attendance or provider identities.
The adapter refuses new Calendar-sourced people/lookups. Explicit independently
authorized Discord statements can supply attendance/labels while the event
itself keeps its Calendar source. An author, mention, helper or organizer alone
does not establish going or physical presence. Both source paths retain their
own current access checks.

Changed/new participation additionally requires a successful `lookup_map_person`
receipt for that exact person UUID and source UUID/URL in the current batch.
Lookup accepts only the original Discord author ID or actual single Gmail From
mailbox from queued full content or observed live originals/body reads. Display
names, addresses in display text, mentions, claimed provider IDs and Miro titles
cannot supply linked identity. Ambiguous/multiple From headers defer. Receipt
state clears between batches; unknown lookup results grant nothing. Unchanged
independently sourced current participants remain intact without a new lookup.

Descriptions/examples describe shapes, not grants. Synthetic IDs and URLs must
never be copied into live writes. PostgreSQL/trusted service enforce Unicode
code-point lengths; transport schema bounds allow UTF-16 astral characters without
silently truncating them. Nullable fields are omitted from tool arguments and
normalized by the service/SQL. Database-managed timestamps are never supplied.

## Approved timing and interpretation

For a NEW explicit current-location report without an end, trusted service uses
original report time+7200seconds only when the presence start equals that report
and is not future-dated. This is a freshness cutoff, not a promised departure.
Processing a delayed report never refreshes it. A newer explicit location
confirmation may refresh the window after reading/merging current state;
activity-only partial edits preserve expiry.

A NEW timed scheduled event with a supported start and no end defaults to
start+7200seconds. Explicit ends/durations win. Complete existing updates missing
an end are rejected rather than resetting a known end to the default. Neither
policy supplies missing future-person-plan times, unknown starts or all-day
boundaries. All-day records use exclusive local date ranges and named timezone,
including daylight-saving changes. Unknown times produce no map marker. Future
participation stays upcoming until its validity window begins.

Relative dates use original provider timestamps and supported source timezone,
not queue processing time. Legacy arrays lacked report timestamps, so migration
uses their original start as a documented proxy; this is not an authoritative
source revision time. Source chronology remains an evidence/prompt responsibility,
while SQL version tokens protect concurrent database changes.

The prompt keeps self-reports, personal plans, scheduled events, responsibilities
and RSVPs distinct. Helping/organizing does not establish attendance. Explicit
going participation supplies planned map visibility during its window and does
not verify physical arrival. Labels use supported stated activity; unknown labels
remain empty. Literal text stays plain text. Corrections preserve unrelated
people/locations/fields; absence, deleted-source uncertainty or partial pages never
imply cancellation. Unsupported actionable inputs remain pending.

## Verification

`tests/map-contracts.test.mjs` checks current schemas/examples, actual normalized
SQL and unchanged historical migration hashes. `tests/update-agent-prompt.test.mjs`
captures the actual handler request and checks delivered rules/completion failure
paths. `tests/map-event-tools.test.mjs` and `tests/update-agent-map.test.mjs` exercise
registered tools, exact source/batch scope, identity resolution, stale versions and
pending-safe failure behavior. Existing Miro/Calendar ownership and source rules,
fragment continuation and sole-call finish_batch protocol remain.

`tests/update-agent-sync-policy.test.mjs` exercises live Discord follow-up reads,
fixed-Calendar occurrence provenance, exact identity, mixed independent event/
participation sources, missing configuration, scope revocation and rejected
forgeries. `tests/calendar-map-provenance.test.mjs` checks exact live Calendar
authorizations and trusted chat-source metadata. These are bounded synthetic
checks; they do not establish live model compliance or completed Calendar/map
synchronization. A large board/calendar may need multiple batches under the
existing thirty-two-call/sixteen-round default budget; unfinished inputs remain pending.

## Completion fence and bounded recovery

The production handler now defaults to sixteen model turns and thirty-two tool
calls, within the three-minute run bound, disabled worker default and original
thirty-input/oldest-thirty-minute cadence. `.env.example` declares the same limits.
Read-only tools returning `invalid_request` provide feedback for a corrected read;
unknown tools, invalid schemas, denied access and failed mutations remain failures.

The bundled adapter exposes `validateCompletion`, passed into the handler through
the existing runtime adapter spread. For configured Calendar map provenance,
completion requires every page of the exact reconciliation window, projection of
every observed occurrence, and an exact `read_calendar_event` using the returned
eventId after every Calendar mutation. Reading a Discord message ID cannot satisfy
that obligation. Calendar map writes before that read or with mismatched source
title, occurrence identity, original report timestamp or time boundaries fail.

An exact current normalized scheduled-event snapshot from `read_map_events`
satisfies projection without another write. Absent/stale records require a
successful upsert. Partial pages, missing original timestamps and unsupported
identities remain pending. The finish fence returns bounded `nextActions` feedback
and lets the model continue within its budget; it never calls store completion
while work remains. Exhausted runs release the lease with inputs intact. All
obligations, source facts and feedback remain batch-local memory; durable receipt
storage gains no original source content. Custom adapters without the optional
hook retain their prior completion contract.

Calendar projection URLs come from the exact already observed, currently
authorized occurrence. The trusted `prepareArguments` hook binds source_url and
any optional url to that canonical URL and retains exact location plus original
managed Miro/Discord sourceUrl in notes. A model's corrupted URL cannot choose
another occurrence. Other source identity, timing, membership and ownership checks
still apply. The handler validates the prepared arguments against the schema and
hashes those actual canonical arguments for the action receipt before execution.
This replaces the earlier URL-copy retry feedback, which real-model tests found
could repeat the same copying error. Unknown occurrences, wrong source UUIDs and
revoked access still fail closed; canonicalization grants no new source identity.

`tests/discord-calendar-sync.test.mjs` covers explicit create/live reads, native
edits, new-message/cross-source conflicts, affirmative cancellations, RSVP and
personal-activity negatives, stale/removed/excluded/truncated originals and local
all-day windows. Calendar-client tests cover deterministic Discord identities,
human-edit preservation and denied forged grants. The actual-handler projection
regression proves canonical source URL, optional URL and managed origin survive
with one write and a receipt hash of the applied canonical arguments.

Run `npm run test:update-agent-prompt`, `npm run test:map-events` and
`npm run test:agent-automation`. Synthetic tests establish delivered instructions
and backend enforcement, not live model compliance. The configured-model synthetic-source suite is scripts/verify-agent-prompts.mjs.
A live-source mutation pilot and worker activation remain separate. See [schema](events.md) and
[acceptance evidence](../evidence/events-relationships/info.md).

The actual contracts require type_id from the five predefined catalogue codes. read_map_events returns the complete safe catalogue even when event filters return no records. Classification must be supported by source evidence; use other when unknown and preserve an existing category on unrelated edits. No type/catalogue mutation tool or broader source grant follows.

A sole `finish_batch` with exactly an empty handledInputIds list receives bounded
pending feedback with actual batch IDs and deterministic remaining-work actions.
It cannot complete inputs or record an applied receipt; every retry still counts
toward call/round/time bounds. Foreign IDs, arbitrary malformed arguments, unknown
tools and mixed completion calls remain rejected. Calendar continuation tokens
must match an observed unfinished page for the same window before HTTP. Declared
Miro boardId choices are restricted to configured boards; current authorization
is independently rechecked.

For authorized observed Calendar projections, trusted preparation sets reported_at from the exact original updatedAt/createdAt before receipt hashing. It preserves map optimistic revision tokens and participant timestamps; sparse cancellations retain known facts. Missing/invalid source timestamps never fall back to the processing clock.
