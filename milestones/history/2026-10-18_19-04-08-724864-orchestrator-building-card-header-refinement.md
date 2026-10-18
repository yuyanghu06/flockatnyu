# Building activity header refinement

- Local timestamp / acting role / milestone: 2026-10-18T19:04:08.724864-04:00 / orchestrator / rapid UI refinements.
- Requested scope: remove the date below the building name, tighten the title/subtitle gap, and make Scheduled events light gray.
- Starting repository state: concurrent backend/chat changes present; preserved and excluded from this UI release.
- Work performed / changed files: src/map-presence.js removes only the decorative date node/formatter and adds a scheduled-section class; src/map-presence.css uses a16px heading gap and #8a8a8a section label.
- Decisions: retain event dates, times and #737373 metadata. No data or authorization changes.
- Checks and evidence:28 map presence/drag tests pass. Isolated production frontend build passes (existing large chunk advisory). Chrome synthetic card has no date,16px gap, rgb(138,138,138) subtitle and retained event time. Direct checks, without independent agents.
- Resulting state / acceptance: requested header layout accepted locally.
- Remaining work and handoff: sanitized web-only Railway publication and hosted asset verification underway. Concurrent source edits excluded.
