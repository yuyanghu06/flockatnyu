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

`presence.js` supplies the read-only `/api/map/presence` backend. It reads the
minimal `map_buildings` and trackable-person selects
with server-only credentials, fixed origins, response-size limits and a bounded
request deadline. The service separates active occupants from future planned entries in an `upcoming` array, with identical validation and current-source policy checks. Future plans do not appear as current map avatars. Browser responses include only building identity and safe
portrait/name/label/status/time fields; Discord IDs, email and source provenance remain
server-side. Portrait URLs are restricted to this project's avatar directory.

The explicit Bobst debug fixture is shown only to the authenticated loopback
`local-development` principal outside production. Its provenance is used only
for authorization; no fixture flag or derived display text is sent to browsers.
Each presence entry carries its own `label`, preserved verbatim (including blank
labels) with at most 200 Unicode code points. Invalid/missing labels are hidden,
not replaced with inferred text. Person/building names also come from tables.
The fixture script explicitly writes `label: "Test"`; these are temporary planned
test occupants, not verified physical presence.
All other entries require both the principal source allowlist and a positive,
current-policy `authorizeSource` callback. Without that callback they stay hidden.
Production keeps the existing fail-closed member authentication. Responses are
`no-store`, and unavailable/unconfigured data returns HTTP503 rather than a
fabricated empty success. Store, fetch, clock and policy seams are injectable for
independent tests. No map write endpoint or frontend database grant is added.

Fixed location boundary: migration022 restricts runtime map_buildings mutations to people_here. IDs/names/aliases and building insert/delete are denied; updated_at is maintained internally by the validation trigger. Existing invoker moves and read API remain compatible. Future map agent tools must preserve this boundary; none are exposed yet.

Explicit owner-requested local plans have a separate exact provenance pair,
one fixed existing person ID and only the three approved locations. This is
available solely to the loopback local-development principal outside production;
partial/forged provenance, other people/locations and non-planned statuses are
rejected. It is not a general source-policy bypass or an agent write tool.
Today/current map entries still require valid_from <= now < expires_at; future
plans are returned only under upcoming. Applied SQL and catalogue stay unchanged.

Building reads now include scheduled_events. The service returns safe events
per building after validating times, statuses, flat display fields, safe HTTPS
links and timezone. Expired/cancelled events are omitted and results sort by start.
Both the principal source allowlist and a positive authorizeSource check remain
mandatory; local person/debug provenance never grants event access. The runtime
callback is still default-deny/unwired. Source metadata is never returned.
Migration024 is applied; this module adds no event-writing endpoint or adapter.

`contracts.js` exports deeply frozen entry/array schemas for `people_here` and
`scheduled_events`, a shared `MAP_RECORD_CONTRACTS` catalogue, synthetic
`MAP_RECORD_EXAMPLES`, and `buildMapRecordPrompt()`. The update-agent system
prompt embeds these same objects and semantic decisions directly. Schemas use
the existing tool-schema keyword subset; they are storage descriptions, not a
second validation engine or registered map tools. Database/trusted tools still
must enforce canonical UUIDs (any version/variant), known trackable identities,
source policy, valid ordered times, timezone names, trimmed titles and uniqueness.
String bounds describe PostgreSQL Unicode code points; generic tool argument
validation counts UTF-16 units, so a future map adapter must address that mismatch.
Example IDs and sources are illustrative only and must never become live data.
People mutations require linked provider user identity; building events require
stable provider event/source identity without a person/attendee lookup. The
default bundled adapter has no map tools; actual trusted tool definitions govern
callability, including custom adapters. No agent map writer, profile/catalogue
permission or scheduled-event write grant
is introduced. Current scheduled-event runtime access remains read-only.

Explicit Bobst event UI fixtures have a separate provenance pair from person fixtures. Only nonproduction local-development, Bobst, exact source UUID/URL and bobst-ui-debug-v1-/[UI TEST] prefixes qualify; ordinary events retain allowlist plus current-policy checks. No runtime event-write grant added.

`PRESENCE_DEFAULT_TTL_SECONDS` and the frozen `PRESENCE_DEFAULT_POLICY` document
the user-approved two-hour freshness cutoff for explicit current self-reports
without an end, anchored to the original provider timestamp. New explicit location
confirmation refreshes it; activity-only edits do not. Explicit ends override it;
future plans/events cannot use that presence freshness policy. These are prompt policy exports, not an active
writer or automatic expiry application in a registered map tool.
`EVENT_DEFAULT_DURATION_SECONDS` and frozen `EVENT_DEFAULT_POLICY` separately
describe the approved two-hour duration for timed events with supported starts
and missing ends. Explicit source ends/durations override it; partial edits
preserve known ends, all-day dates use exclusive local-midnight ends, and unknown
starts defer. These constants change no existing stored data or tool capabilities.

Optional event attendee_ids are validated and resolved only after event authorization. Only trackable map_people names and safe local portraits reach attendees; no emails/provenance or automatic presence writes.
