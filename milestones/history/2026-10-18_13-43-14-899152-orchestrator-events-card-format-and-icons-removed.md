# Dedicated events: events-card-format-and-icons-removed

- Local timestamp / acting role / milestone: 2026-10-18T13:43:14.899152-04:00 / orchestrator / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Integrated src/map-presence.js/css all-kind building rows, explicit weekday/date/time with650weight, separate room line and recognized repeated-building-prefix removal for presentation only. Preserved parallel gray-time request (#737373). Removed all category imports/rendering/CSS and generated event-icon assets following explicit user cancellation. Mobile details use full row width and portraits flow below. Tester found the fixed assistant launcher could obscure the final portrait in a long390px card; CSS now reserves24px above/96px below via max-height calc(100% - 120px) and translateY(calc(-50% - 36px)). Frontend/API builds pass. Normal5173/API3001 live Chrome receipt verifies Stern1row, Bobst3rows,0categoryicons/assets, roomprefix removal,650time,4portraits and2thoughtbubbles,0pageerrors; private screenshot retained only under/tmp. Source data/times untouched. Existing yesterday UI fixtures retain their original explicit24hour ends; current all-day attendance can last to local midnight. Final clean independent mobile/browser rerun and evaluation follow.

