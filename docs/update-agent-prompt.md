# Update-agent prompting and structured map records

`server/automation/prompt.js` is the actual system prompt delivered by the automation handler. It imports `buildMapRecordPrompt()` from `server/map/contracts.js`, which supplies deeply frozen machine-readable schemas, synthetic examples, semantic rules and operator-approved default policies. This is runtime prompt wiring, not a disconnected draft.

The canonical building columns are `people_here` and `scheduled_events`. The name `events_here` was used in conversation; it is not a database column. Existing migrations023/024 already validate these arrays, so this prompt work adds no migration, columns or write grants.

| Array | Structure |
| --- | --- |
| `people_here` | At most500 flat objects, unique person per building. Exactly7 string keys: `person_id`, `status`, `valid_from`, `expires_at`, `source_id`, `source_url`, `label`. Status is `self_reported` or `planned`; label is0–200 Unicode code points. |
| `scheduled_events` | At most200 flat objects, unique event ID per building. Required `id`, `title`, `starts_at`, `ends_at`, `time_zone`, `all_day`, `status`, `source_id`, `source_url`; optional `description`, `location`, `url`. Only `all_day` is boolean; other values are strings. Event status is `confirmed`, `tentative` or `cancelled`. |

The complete field bounds and descriptions are exported from `contracts.js`; examples are synthetic shape illustrations, never real identities or links to copy. Database validation and trusted tool checks remain necessary. Generic argument-schema string lengths currently count UTF-16 units, while PostgreSQL counts Unicode code points; future map tools must handle that difference. Timestamp order, named timezone, source authorization and identity lookup are semantic checks, not guarantees supplied by a field-name schema alone.

## Approved two-hour defaults

An explicit current-location report without an end expires7200seconds after its original provider timestamp. A newer explicit location confirmation refreshes that window. An explicit end overrides the default; an activity-only partial edit does not extend presence. The expiry is a freshness cutoff, not a claimed departure time. A delayed report must never become fresh again because it was processed late. Unknown source timestamps or ambiguous dates require resolution.

A timed event with a supported start but no end/duration defaults to7200seconds. Explicit ends/durations take precedence; partial edits preserve an existing known end. The agent cannot invent a start time. Explicit all-day events use local-midnight offset timestamps with an exclusive end, including daylight-saving offset changes; the two-hour event default does not apply to all-day dates. Neither default supplies missing future-person-plan times.

## Decision workflow

The prompt separates current self-reports, future plans, building events, responsibilities and RSVPs. People updates require a verified linked person ID; event records require a stable event/source identity and known building, without requiring an attendee. Buildings come from the fixed catalogue. Events never automatically place people on the map.

Activity labels describe what the person shared they are doing at the location; unknown activity is `""`. Stored text is displayed directly. The agent must not infer studying from Bobst, turn source metadata into captions, or add formatting instructions. Literal characters remain safe plain text.

Relative dates are anchored to the original source timestamp and supported timezone, not the processing day. Corrections preserve stable identities, unrelated entries and fields absent from partial edits. Missing items, partial pages and deleted-source uncertainty do not establish cancellation. The prompt forbids direct SQL, catalogue/profile edits, broad array replacement, fabricated IDs/provenance and claims of successful writes without successful tool results.

Existing Miro/Calendar ownership, live evidence, human-edit protection, source-access rules, fragment continuation and scoped input IDs remain. `finish_batch` stays a sole-call completion step and must leave unsupported actionable inputs queued.

## Current capability boundary and checks

The default bundled adapter still has no map tools. Runtime credentials may update only `people_here`; `scheduled_events` is read-only. A prompt cannot register a tool, grant event-write access, deploy the worker or bypass the pending Calendar preflight. Actual trusted tool definitions determine which actions are callable, including any future approved custom adapter.

`tests/map-contracts.test.mjs` compares schemas/examples with actual001–024 SQL and unchanged grants. `tests/update-agent-prompt.test.mjs` captures the real handler's provider request, checks delivered rules/policies and exercises unsupported-action/completion failure paths. Run `npm run test:update-agent-prompt`, or the broader `npm run test:agent-automation`.

These checks establish prompt delivery and structured validation. They do not prove that a live model follows every instruction; a bounded end-to-end pilot remains necessary after tool wiring, Calendar dependency resolution and worker deployment.
