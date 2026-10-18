# Dedicated events: events-thought-bubbles-restored

- Local timestamp / acting role / milestone: 2026-10-18T13:21:48.955280-04:00 / orchestrator / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Fixed the user's disappearing thought bubbles. Blank newer scheduled attendance had masked older supplied activity while labels remained intact in normalized records. Projection now chooses the newest authorized active NONBLANK participation label by that participant's reported_at; stable event order breaks ties. No label is inferred from event/building names. Blank-only records remain blank; authorization, timing unions, multiple locations and event state remain unchanged.

Coder20/20presence checks and independent evaluator23/23presence/source checks pass. Actual Chrome on5173verified two visible Bobst thought bubbles with exact original labels and0page errors; screenshot private under /tmp. Final main5173/API3001reload picks up participant-time ranking; API label match confirmed. API syntax/runtime import check and final diff check pass. No SQL/data/model/source writes. Evidence: evidence/events-relationships/label-overlap-verification.json; code guide and docs/map-presence.md updated.

User's Stern question answered from a read-only normalized snapshot: existing migrated personal_plan covers18October midnight-to-next-midnight NewYork and has a blank activity. It supplies planned map visibility; building Scheduled card intentionally lists scheduled_event kinds only. No new Stern plan was created. UI distinction remains a possible future product refinement, not an unauthorized content/schema edit. Concurrent chat/UI work preserved.

