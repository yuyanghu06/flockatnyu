# Dedicated events: events-runtime-and-projection

- Local timestamp / acting role / milestone: 2026-10-18T13:07:42.827102-04:00 / coder / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Normalized event store/service and compatible map projection implemented in server/map/events.js and presence.js. All eligible people display at every linked building; overlapping avatars deduplicate per building with combined active windows and per-activity details. Future schedules, all-day timezone/DST boundaries, exact local-only fixture scopes and safe profiles remain. New timed scheduled records and explicit current reports receive approved deterministic two-hour defaults; no defaults for personal plans/all-day/unknown starts and no resetting existing ends. Source and replaced-participation authorization, CAS, exact email identity verification, request cancellation, snapshot/projected output bounds fail closed. Coder32/32 targeted tests passed. Root inspected actual files. No cloud writes/model calls/deployment by coder. Original legacy reported_at proxy is not a provider revision time; chronology remains source-evidence policy. Independent integration verification running.

