# Calendar is the canonical scheduled-event view

- Local timestamp / acting role / milestone: 2026-10-18T14:49:52.261434-04:00 / orchestrator / agent-prompts.
- Requested scope: user added planner Calendar updates from Discord and clarified Calendar events plus map-only informal activity.
- Starting repository state: final prompt tests ongoing; unrelated dirty changes preserved.
- Work performed / changed files: saved clarification in notes.md; assigned bounded Discord Calendar provenance implementation and additional actual-model cases. Corrected chat timing wording after independent review: original explicit report timestamp, sourceUpdatedAt only for verified fresh location confirmation, no activity-only refresh.
- Decisions: Calendar is the scheduled club-event view; map mirrors events plus informal activity. Miro remains read-only. Discord participation alone is not a new Calendar event. Preserve human edits and defer ambiguous matches.
- Checks and evidence: full pre-extension regression886/886passed; API and frontend builds passed (existing large-chunk advisory). Corrected chat timing23/23passed. Evaluator150/150passed with timing wording finding now corrected. Focused model map/self4/4passed (28requests); Miro flow still failed roundlimit because model twice corrupted opaque Calendar URL, so no final acceptance.
- Resulting state / acceptance: new Discord Calendar implementation and improved deterministic projection guidance underway. No worker activation/deployment or real Calendar/map mutations.
- Remaining work and handoff: complete new scope, test positive events/edit/cancel plus negative informal/RSVP, independent review, stable actual-model suite and final checks.
