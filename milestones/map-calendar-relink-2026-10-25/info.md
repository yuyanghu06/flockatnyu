# Active Calendar source correction

Goal: use the exact active Calendar occurrence selected in the user's screenshot and preserve attendance at Kimmel.
Scope: one active map-event relationship update through normal source/catalogue/version checks. Cancelled original and Calendar originals stay unchanged.
Completion criteria: exact source match; attendee preservation; independent sync stability check; successful versioned write; live map visibility verification.
Status: complete; one authorized target update applied and independently accepted.

Source identity cannot be replaced. The correct active occurrence already has a map record; reuse it, add only missing participants and the Kimmel relation, and retain its empty notes for blank-location sync stability.

[Plan and discovery](../history/2026-10-25_13-52-07-052546-planner-active-calendar-map-correction-planned.md). Current implementation truth remains in ../milestone.md.

The active event now has Kimmel and five total attendee records: all three existing records preserved, two missing chat attendees added. The cancelled original remains untouched. Hosted map API readback confirms the correct active event and five listed attendees; four avatars are current and the fifth retains a4PMstart. Independent deployed-module sync checks preserve this correction with blank Calendar location. No Calendar/schema/runtime/config changes or deployment.

[Applied correction and hosted evidence](../history/2026-10-25_13-55-49-003669-orchestrator-active-calendar-map-correction-applied.md) · [Independent acceptance](../history/2026-10-25_13-55-49-003669-evaluator-active-calendar-map-correction-accepted.md). Browser appearance and later live sync remain unobserved.
