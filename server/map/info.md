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
bounds, cancellation and a maximum15second deadline apply to all requests.

The service exposes authorized event reads, exact linked Discord/email identity
lookup and complete optimistic event replacement through `map_upsert_event`.
Provider IDs are lookup inputs only; safe profiles are returned without email or
Discord identity fields. Lookup requires authorized supporting provenance.
Every event and participant source requires the principal's shared allowlist
and a strictly positive current-policy callback, which defaults to denial.
Replacement also authorizes removed/replaced old participation and repeats the
checks immediately before the transaction. Source identity is immutable;
concurrent changes yield a conflict, with no broad catalogue/profile write API.
Read responses retain authorized provenance for trusted agent reconciliation;
browser responses do not. Unknown people/buildings, extra keys, invalid time
windows and duplicate relationships are rejected. Service writes accept optional
new event UUIDs but require stable original source-record identity.

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
Only trackable roster names and safe local avatar paths reach browsers. Labels
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

Calendar provenance now verifies the configured allowed Calendar source UUID and exact canonical event link against a current read of the fixed calendar. Source access is rechecked by the shared service. Both agent adapters bind Calendar record identity to the observed eventId; attendance uses separate authorized originals. Request-local chat and batch-local update identity receipts bind changed participants to exact original author/sender evidence. Building/profile/type catalogues stay fixed.

`chat-intent.js` recognizes affirmative current-turn map action clauses and rejects negated actions for chat write authorization; source content cannot supply that intent.

`chat-attendance.js` implements the separate current-chat named-person attendance path: unique fixed roster/event resolution, request-bound selections, current source checks and optimistic complete-snapshot preservation. It writes going/planned participation only and generates strict app provenance. `source-access.js` recognizes that marker only under configured PUBLIC_ORIGIN and reauthorizes the referenced event's supported original; no provider identity is invented. Web and worker need matching origin configuration. Generic upserts and provider identity receipts remain unchanged.

App attendance markers also require the actual caller eventId/personId to match the encoded IDs. Authorization context travels through both map service writes/reads and browser projection, so another existing roster member cannot reuse a valid marker. Request-local attendance tools are omitted entirely when the current message lacks a configured affirmative named attendance declaration.
