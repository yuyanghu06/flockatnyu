# fields

## uuid.text

<!-- prompt: uuid.text -->
{{description}} Canonical UUID: 8-4-4-4-12 hexadecimal digits; any version/variant, including deterministic roster UUIDs. Resolve an existing ID; never invent one.
<!-- /prompt -->

## timestamp.text

<!-- prompt: timestamp.text -->
{{description}} Finite valid timestamp YYYY-MM-DDTHH:mm:ss[.1-to-6-fractional-digits](Z or explicit +/-HH:mm offset); maximum40 characters.
<!-- /prompt -->

## sourceurl.text

<!-- prompt: sourceurl.text -->
Exact supporting original HTTPS source URL; nonempty host, no whitespace/control characters; optional path. Source access is independently enforced.
<!-- /prompt -->

## lengthnote.text

<!-- prompt: lengthnote.text -->
String bounds follow PostgreSQL Unicode code points. Generic validateArguments currently counts UTF-16 code units; a future map adapter must account for that difference instead of rejecting valid astral text or silently truncating it.
<!-- /prompt -->

## people_here_entry_schema.description

<!-- prompt: people_here_entry_schema.description -->
One person/window, exactly seven string fields; existing trackable person only. expires_at must be strictly after valid_from. {{lengthNote}}
<!-- /prompt -->

## people_here_entry_schema.person_id

<!-- prompt: people_here_entry_schema.person_id -->
Existing map_people.id resolved through a stable linked provider identity.
<!-- /prompt -->

## people_here_entry_schema.status.description

<!-- prompt: people_here_entry_schema.status.description -->
Explicit current self-report or stated plan; neither verifies physical presence.
<!-- /prompt -->

## people_here_entry_schema.valid_from

<!-- prompt: people_here_entry_schema.valid_from -->
Supported start of this location window.
<!-- /prompt -->

## people_here_entry_schema.expires_at

<!-- prompt: people_here_entry_schema.expires_at -->
Supported exclusive expiry, strictly after valid_from; required even when activity is unknown. Explicit current self-reports without an end use the approved two-hour freshness policy anchored to the original provider report timestamp; this is not a promised departure.
<!-- /prompt -->

## people_here_entry_schema.source_id

<!-- prompt: people_here_entry_schema.source_id -->
Existing authorized source catalogue identity, not person ID or queue input ID.
<!-- /prompt -->

## people_here_entry_schema.label

<!-- prompt: people_here_entry_schema.label -->
Verbatim displayed activity, grounded in what the person shared at this location. Unknown activity is the empty string. No source/status-generated caption or invented activity; display as plain text, not interpreted markup.
<!-- /prompt -->

## people_here_schema.description

<!-- prompt: people_here_schema.description -->
map_buildings.people_here: at most500 entries; each person_id unique within this building. Building ID is selected separately from the fixed catalogue, never embedded in an entry. This schema is not permission to overwrite the entire array.
<!-- /prompt -->

## scheduled_event_entry_schema.description

<!-- prompt: scheduled_event_entry_schema.description -->
Flat building event: nine required fields plus only three optional display strings. ends_at must be strictly after starts_at. {{lengthNote}}
<!-- /prompt -->

## scheduled_event_entry_schema.id

<!-- prompt: scheduled_event_entry_schema.id -->
Stable provider event/item identity, scoped to its provider/source where needed; preserve across corrections, retries and cancellation. Never derive from an array index, queue UUID, mutable title or date.
<!-- /prompt -->

## scheduled_event_entry_schema.title

<!-- prompt: scheduled_event_entry_schema.title -->
Supported event title; PostgreSQL btrim(title) must contain1–200 Unicode code points. The bound applies after trimming, not to the raw string.
<!-- /prompt -->

## scheduled_event_entry_schema.starts_at

<!-- prompt: scheduled_event_entry_schema.starts_at -->
Supported event start.
<!-- /prompt -->

## scheduled_event_entry_schema.ends_at

<!-- prompt: scheduled_event_entry_schema.ends_at -->
Exclusive event end: explicit source end/duration overrides; otherwise the approved timed-event default is supported start +7200seconds when end is missing. Preserve existing end on partial edits; all-day dates use exclusive local-midnight end instead.
<!-- /prompt -->

## scheduled_event_entry_schema.time_zone

<!-- prompt: scheduled_event_entry_schema.time_zone -->
Actual timezone name recognized by PostgreSQL pg_timezone_names, normally America/New_York when the source supports the local campus default.
<!-- /prompt -->

## scheduled_event_entry_schema.all_day.description

<!-- prompt: scheduled_event_entry_schema.all_day.description -->
For explicit all-day dates, use local-midnight offset timestamps and an exclusive local-midnight end in time_zone. These are flat timestamps, not Google Calendar date objects.
<!-- /prompt -->

## scheduled_event_entry_schema.status.description

<!-- prompt: scheduled_event_entry_schema.status.description -->
Supported event state; cancelled requires explicit cancellation evidence for the same stable event.
<!-- /prompt -->

## scheduled_event_entry_schema.source_id

<!-- prompt: scheduled_event_entry_schema.source_id -->
Existing authorized source catalogue identity.
<!-- /prompt -->

## scheduled_event_entry_schema.description.2

<!-- prompt: scheduled_event_entry_schema.description.2 -->
Optional supported description; omit when unknown.
<!-- /prompt -->

## scheduled_event_entry_schema.location

<!-- prompt: scheduled_event_entry_schema.location -->
Optional supported location text; does not modify the fixed building catalogue.
<!-- /prompt -->

## scheduled_event_entry_schema.url

<!-- prompt: scheduled_event_entry_schema.url -->
Optional event HTTPS URL with nonempty host and no whitespace/control characters, or empty string.
<!-- /prompt -->

## scheduled_events_schema.description

<!-- prompt: scheduled_events_schema.description -->
map_buildings.scheduled_events: at most200 flat events, unique id per building. No attendees, nested provider payloads, buildingId property or extra keys. The fixed building is selected separately. Runtime event writes are currently denied.
<!-- /prompt -->

## map_event_schema.id

<!-- prompt: map_event_schema.id -->
Existing event UUID when updating; omit for creation and let the trusted service assign it.
<!-- /prompt -->

## map_event_schema.name

<!-- prompt: map_event_schema.name -->
Supported activity or event name, 1–200 Unicode code points after trimming.
<!-- /prompt -->

## map_event_schema.notes

<!-- prompt: map_event_schema.notes -->
Supported longer details; blank when unknown.
<!-- /prompt -->

## map_event_schema.type_id.description

<!-- prompt: map_event_schema.type_id.description -->
Existing event_types.code from read_map_events. Choose using source evidence, other when unknown; preserve the existing classification during unrelated edits. No catalogue writes.
<!-- /prompt -->

## map_event_schema.starts_at

<!-- prompt: map_event_schema.starts_at -->
Timed inclusive start; omit when not timed.
<!-- /prompt -->

## map_event_schema.ends_at

<!-- prompt: map_event_schema.ends_at -->
Timed exclusive end after start; omit when not timed.
<!-- /prompt -->

## map_event_schema.starts_on

<!-- prompt: map_event_schema.starts_on -->
All-day inclusive local YYYY-MM-DD; omit when not all_day.
<!-- /prompt -->

## map_event_schema.ends_on

<!-- prompt: map_event_schema.ends_on -->
All-day exclusive local YYYY-MM-DD; omit when not all_day.
<!-- /prompt -->

## map_event_schema.time_zone

<!-- prompt: map_event_schema.time_zone -->
IANA timezone, normally America/New_York when evidence supports it.
<!-- /prompt -->

## map_event_schema.source_id

<!-- prompt: map_event_schema.source_id -->
Existing authorized source catalogue identity, never a queue UUID.
<!-- /prompt -->

## map_event_schema.source_record_id

<!-- prompt: map_event_schema.source_record_id -->
Stable original provider event/item identity scoped to source; preserve across corrections and retries.
<!-- /prompt -->

## map_event_schema.url

<!-- prompt: map_event_schema.url -->
Optional event HTTPS URL or empty string.
<!-- /prompt -->

## map_event_schema.reported_at

<!-- prompt: map_event_schema.reported_at -->
ORIGINAL provider report timestamp; never worker received/processing time.
<!-- /prompt -->

## event_buildings_schema.description

<!-- prompt: event_buildings_schema.description -->
Complete building relationships for ONE event; each building appears once. Every participant displays at EVERY linked building. No primary building or person-specific building.
<!-- /prompt -->

## event_buildings_schema.building_id

<!-- prompt: event_buildings_schema.building_id -->
Existing fixed map_buildings.id, e.g. bobst-library.
<!-- /prompt -->

## event_buildings_schema.location_notes

<!-- prompt: event_buildings_schema.location_notes -->
Room/floor/meeting point; blank when unknown.
<!-- /prompt -->

## event_people_schema.description

<!-- prompt: event_people_schema.description -->
Complete participant relationships for ONE event. Preserve unrelated participants on partial evidence; read and merge first.
<!-- /prompt -->

## event_people_schema.person_id

<!-- prompt: event_people_schema.person_id -->
Existing trackable map_people.id resolved by linked provider identity; no name-only inference.
<!-- /prompt -->

## event_people_schema.label

<!-- prompt: event_people_schema.label -->
Exact plain-text activity caption, at most200 Unicode code points. Unknown activity is empty; preserve literal angle brackets.
<!-- /prompt -->

## event_people_schema.starts_at

<!-- prompt: event_people_schema.starts_at -->
Optional individual arrival override inside the event interval; missing inherits event start.
<!-- /prompt -->

## event_people_schema.ends_at

<!-- prompt: event_people_schema.ends_at -->
Optional individual departure override inside the event interval; missing inherits event end.
<!-- /prompt -->

## event_people_schema.source_id

<!-- prompt: event_people_schema.source_id -->
Authorized source supporting this person’s participation.
<!-- /prompt -->

## event_people_schema.reported_at

<!-- prompt: event_people_schema.reported_at -->
Original report timestamp for this participation.
<!-- /prompt -->
