# Events, participation and map locations

The user approved normalized event storage on 2026-10-18. Activity lives in
`events`, `event_buildings` and `event_people`; `map_buildings` and `map_people`
remain catalogues. The rolling milestone records actual migration and verification
status. Migration026 is additive/backfills;027 removes the old columns only after
an exact preservation check. Applied001–025 migrations remain historical evidence.

## Tables

`events` stores one occurrence, including private study/presence reports and
personal plans as well as scheduled club events. Its UUID is an internal identity;
`(source_id, source_record_id)` is the stable external deduplication key. Titles,
times and queue batch IDs must not become changing provider identities.

| Field | Meaning |
| --- | --- |
| id | UUID primary key |
| name, notes | Short name and longer supported description |
| kind | presence, personal_plan, scheduled_event |
| type_id | Foreign key to a fixed activity category: study, meeting, event, social, other |
| status | confirmed, tentative, cancelled, superseded |
| time_kind | timed, all_day, unknown |
| starts_at, ends_at | Finite timed boundaries; start inclusive/end exclusive |
| starts_on, ends_on | Local all-day dates; ending date exclusive |
| time_zone | Named local timezone; campus default America/New_York |
| source_id, source_url, source_record_id | Source authorization, citation and stable external identity |
| url | Optional separate event link |
| reported_at | Supporting original report timestamp |
| created_at, updated_at | Database-managed timestamps; updated_at guards concurrent edits |

Timed records have timestamps and no date fields. All-day records have dates and
no timestamp fields. Unknown records have neither and never populate map markers.
All-day boundaries resolve in their named timezone, including daylight-saving
changes. Building Scheduled lists include all three kinds with a known current/future unexpired window. Personal activities require at least one authorized trackable nondeclined participant whose effective window has not ended; scheduled events may have no attendees.

`event_buildings` has primary key `(event_id, building_id)`, event UUID foreign
key, existing text building foreign key, and optional `location_notes` for room,
floor or meeting-point text. It has no primary-location flag. An unresolved event
can have no mapped building without guessing its location.

`event_people` has primary key `(event_id, person_id)` with existing UUID person
foreign key. It stores attendance_status (going/tentative/declined), presence_basis
(planned/reported), a faithful plain-text label, optional individual starts_at and
ends_at, source_id/source_url/reported_at, and database-managed timestamps.
Individual timing inherits missing boundaries from the event and must fit its
window. Participation has its own provenance: a public event does not establish
that a particular person plans to attend it. Empty labels stay empty.

## Visibility rules

Every eligible person appears at every building linked to their active event.
There is no per-person building assignment or exclusive-location rule: simultaneous
appearances at several buildings are intentional. Different groups at different
locations use separate events. Only confirmed events with going participation
produce avatars; tentative events can remain in the Scheduled list. Cancelled,
superseded, expired or declined records do not produce current markers.

The same person has one marker within a building even when several activities
qualify. The API selects a stable qualifying label/window and can retain activity
details; it never removes that person's valid marker from another building.
Future participation is returned as upcoming rather than displayed early. Actual
presence is not verified by an expected event attendance marker.

The read-only `/api/map/presence` response remains buildings with people/events,
plus upcoming plans. Frontend positioning, camera framing, selection geometry and
portrait assets are independent of event storage. Names and portraits come from
the fixed catalogues, with safe local avatar paths. Source IDs/links, private
profile identity links and backend credentials do not enter the browser response.

## Trusted access and writes

`map_read_events(p_at)` returns a bounded consistent service-only snapshot,
including expired/cancelled rows needed for reconciliation. Capacity violations
fail explicitly instead of silently truncating. This MVP bound must become a
paged/time-windowed query before larger data volumes exceed it.

`map_upsert_event(p_event,p_buildings,p_people,p_expected_updated_at)` writes one
complete event snapshot atomically. A new record has no expected version; updating
an existing record requires its exact prior database timestamp. Partial edits
first read current state, merge only supported changes and submit the complete
snapshot. Conflicts require re-reading; changing the source key to evade a
conflict is forbidden. No cross-event location move or catalogue modification is
implicit in this operation.

New tables force row-level security and deny browser access. Service writes are
restricted to the trusted RPC, with a fixed SQL search path and explicit execute
grants; backend source authorization remains necessary. Source UUIDs deliberately
have no knowledge_sources foreign key: Discord uses a separate metadata catalogue.

`server/map/source-access.js` checks current backend source permissions for every
ordinary event/participant. Discord uses the existing live bot service and its
channel/thread/exclusion/final-catalogue checks. Miro uses current authorized board
scope and exact source URLs. Gmail uses the configured source/account and an
original read-only message lookup. Unknown sources fail closed. Exact existing UI
fixture scopes remain available only to the authenticated local-development
principal outside production.

Shared map tools read authorized event state, resolve known linked person
identities and reconcile events through the same service. Update-agent writes
also require supporting scoped batch inputs or observed authorized live evidence;
source content cannot grant tool permissions. Adding these tools does not activate
a worker, resolve pending Calendar owner sharing, enable Calendar writes beyond
its existing scope, or deploy an API/frontend.

## Preservation and defaults

Each legacy people_here entry becomes a presence or personal_plan event with
one building and one person. Label, source, status and exact validity boundaries
survive. Legacy scheduled events preserve their provider identity, name, notes,
links, buildings and attendee UUIDs. All-day dates preserve the original exclusive
local boundaries. Existing source windows are never refreshed during migration.

Legacy arrays did not store reported_at. The migration uses the old window/event
start as a documented proxy; this is not recovery of the original report time.
New ingestion must use the real original provider timestamp.

For new explicit current reports without an end, the approved freshness cutoff is
original report time plus7200seconds. Only a newer explicit location confirmation
refreshes it; activity-only edits preserve expiry. Timed scheduled events with a
supported start and missing end use start plus7200seconds. Existing explicit ends,
partial edits, all-day boundaries and unknown starts retain their separate rules.

## Fixed event types (028)

Hosted028 (20261018173407_event_types) adds event_types and events.type_id. The catalogue has code, name, description, icon_key and sort_order. The user selected exactly Study, Meeting, Event, Social and Other. This classification is separate from structural kind (presence/personal_plan/scheduled_event).

Existing events default to other without rewriting any previous field, timestamp or relationship. No category is inferred from building names, titles or attendance. New unclassified records use other; unrelated updates preserve an existing category. The shared agent reads the complete safe catalogue through read_map_events and must select one known type. Unknown types fail validation/FK checks. Catalogue creation/edit tools do not exist; service credentials have SELECT only, and browsers have no direct table grants. The later choice of a smaller writable event-field set remains a separate decision.

The user rejected both generated icon sets and cancelled event icons entirely. Category images, loaders, rendering code and newly generated project assets were removed. The five data categories remain. Applied028 retains its safe icon_key column as reserved compatibility metadata; the frontend does not use it or fetch any category images.

Rows show the stored title, bold weekday/date/time, separate room/area notes and safe participant portraits. A repeated recognized building prefix is removed from display because the card heading already identifies the building. Original database location notes remain unchanged. Mobile portraits flow below details to keep the text column readable.

## Chat-declared attendance

An explicit current message naming a person and existing event, such as “Yuyang will be going to help with AWS on Tuesday,” can mark that person going without a Discord reference. Dedicated target lookup resolves a unique trackable roster full name or first-name token and a unique authorized, unexpired scheduled occurrence. Ambiguity, first-person identity, hypothetical/negated/quoted text and attachment contents cannot authorize this path. The service preserves event facts, buildings, other participants and individual timing, checks current access and uses optimistic concurrency. It cannot create events or edit Calendar/catalogues.

Participation inherits the original event source UUID only as its access scope. Its server-generated source URL is a distinct app marker, PUBLIC_ORIGIN/?event=<eventUUID>#attendance-<personUUID>-<requestUUID>, identifying the chat declaration rather than provider authorship. Current canonical app origin, existing trackable person/event and current access to the event's supported original are rechecked when displaying or preserving participation. No raw transcript or new account identity is stored; marker links open the existing map but do not implement event navigation. Worker and web must use the same PUBLIC_ORIGIN. Generic map upserts retain original-provider evidence and exact identity receipts.

Successful chat writes trigger an immediate frontend map refresh. Future going participants appear on the event card/upcoming list and become map avatars only in the event's valid active window.

Event phrases use NFKC/case normalization and contiguous whole alphanumeric token matching, so AWS Hackday and AWS Hack Day can resolve the same occurrence despite spaces, hyphens or punctuation. The same rule binds the current declaration and rechecks the event before writing. This formatting normalizer does not infer synonyms or match fragments of larger tokens; catalogue-based model resolution below handles aliases. Person/date/source/concurrency checks remain unchanged.

When normalized titles do not resolve, lookup returns the authorized, unexpired, date-filtered catalogue with fuzzy bigram ranking and bounded notes/location context. The model resolves clear typos or aliases from those actual events; rank alone is not confidence. All candidates are returned up to20, with explicit truncation and no write receipts for incomplete lists. Exact duplicate matches, multiple matching full contexts and unsupported single short names require clarification. Complete candidate selections bind the exact returned event name/source/revision and recheck authorization before an attendance-only write. Person matching remains exact.
