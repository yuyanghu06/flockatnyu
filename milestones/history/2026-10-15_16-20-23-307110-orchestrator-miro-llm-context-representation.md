# LLM context representation for a Miro calendar

- Local timestamp / acting role / milestone: 2026-10-15_16-20-23-307110 / orchestrator / Miro feasibility follow-up.
- Requested scope: Explain reconstruction usable by an LLM without context loss; user confirms shapes, text, cards and stickies on Free plan.
- Starting repository state: Miro feasibility and Free-plan clarification recorded; no connected Miro board. Concurrent M25/M26 work preserved.
- Work performed / changed files: Reviewed current item listing/detail, board-coordinate, card and connector documentation. Expanded docs/miro-api-research.md with original-object, spatial and calendar-interpretation layers, context-expanded retrieval and coverage verification. Updated docs guide, snapshot and to-do.
- Decisions: Ordinary-object REST is the primary candidate; preserve original API payloads alongside inferred semantics and source evidence. Live/on-demand reading is viable without requiring permanent storage. Relevant headings, legends and notes must travel with event retrieval. Literal zero context loss or perfect LLM understanding cannot be guaranteed; visual comparison and coverage checks required.
- Checks and evidence: Official sources linked in note. Documentation diff whitespace check only; no authenticated API calls, visual tests, code changes or independent agent review in this pass.
- Resulting state / acceptance: Proposed representation documented, with no implementation or live completeness claim.
- Remaining work and handoff: Inspect actual board/frame and verify pagination, available fields, date/legend associations, related resources and ambiguity before integration.
