# Map presence viewport focus refinement

- Local timestamp / acting role / milestone: 2026-10-17T16:16:48.893054-04:00; coder; map-presence-ui.
- Requested scope: bounded followup for portrait clipping and keyboard refresh continuity.
- Starting state: frontend overlay implemented.
- Work performed: same owned frontend files now constrain portrait positions to viewport margins, wrap narrow rows, keep tethers at true roof anchor, and restore surviving selected detail/keyboard focus across refresh.
- Decisions: expired/failed identities clear; retained identities preserve focus without moving map geometry.
- Checks and evidence: fresh frontend build, syntax and scoped whitespace PASS; tester notified.
- Resulting state / acceptance: refinement complete; independent edge/focus/browser verification pending.
- Remaining work and handoff: tester exercises desktop/mobile/resize and refresh behavior.
