# Dedicated events: events-label-participation-ranking

- Local timestamp / acting role / milestone: 2026-10-18T13:21:18.352275-04:00 / coder / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Coder corrected independent participation chronology after evaluator reproduction: overlap captions rank by event_people.reported_at in a private request-local WeakMap, preserve wording, and retain stable event order for ties.20/20presence tests pass including event/participant timestamp disagreement, reverse ordering and no rank/provenance leaks. Root inspected final source. Event status, unioned time windows, per-building deduplication and simultaneous locations unchanged. No database/source writes. API reload and actual browser evidence recorded in integration pass.

