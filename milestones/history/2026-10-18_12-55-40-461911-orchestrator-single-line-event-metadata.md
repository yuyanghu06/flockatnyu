# Single-line event metadata

- Local timestamp / acting role / milestone: 2026-10-18T12:55:40.461911-04:00 / direct implementation / rapid UI refinements.
- Requested scope: combine building event date/time and location onto one line.
- Starting repository state: previous rapid UI refinements pending; preserved.
- Work performed / changed files: src/map-presence.js appends location to event time with a middle-dot separator, removes separate location row, and exposes full text as title. src/map-presence.css keeps metadata on one line with ellipsis when constrained. Source guide and journal refreshed.
- Decisions: keep time datetime semantics and existing event title, tentative state, details link and attendee layout. Missing location adds no separator; long text remains in DOM/title.
- Checks and evidence: npm run build passed with existing chunk advisory. Actual stylesheet headless Chrome isolated desktop/mobile row checks verify single-line height, nowrap/ellipsis and complete hover title, including an attendee avatar. Direct checks; no subagents or full-map rerun.
- Resulting state / acceptance: date/time and location now share one line.
- Remaining work and handoff: next user UI refinement; no data/backend/deployment changes.
