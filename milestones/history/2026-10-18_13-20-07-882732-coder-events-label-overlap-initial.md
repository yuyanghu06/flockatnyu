# Dedicated events: events-label-overlap-initial

- Local timestamp / acting role / milestone: 2026-10-18T13:20:07.882732-04:00 / coder / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Investigated user's missing thought-bubble report after normalized event cutover. Actual local API showed newest blank event attendance masking older authorized active nonblank participant labels, while original labels remained intact in activities/hosted rows. Coder changed overlap caption fallback and added broad regression coverage;20/20map-presence tests pass. Root inspected implementation and restarted normal5173/API3001preview after API syntax/import check passed. No database changes or labels invented. Independent evaluator found a further chronology edge: participant reported_at can be newer than parent event reported_at, so candidate ranking must use the participation timestamp; follow-up fix/test assigned before final acceptance.

User's Stern question investigated with a read-only normalized snapshot: an existing migrated personal_plan for18October's NewYork day produces the avatar; no new plan was invented. The Scheduled building card intentionally filters scheduled_event and therefore shows no scheduled club events for that personal plan. Blank labels at Stern remain blank.

