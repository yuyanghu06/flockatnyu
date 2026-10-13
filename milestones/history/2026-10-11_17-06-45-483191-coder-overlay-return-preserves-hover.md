# Overlay return preserves hover

- Local timestamp / acting role / milestone: 2026-10-11T17:06:45.483191-04:00 / coder / M19.
- Requested scope: screenshot camera views and screen-wide focused return.
- Starting state: concurrent backend changes preserved; provisional M19 implementation.
- Work performed / evidence / acceptance: Specialist refined the shared wheel path so off-canvas return preserves map pointer/dirty state; canvas-origin events keep hover follow. src/map-interactions.js only. Existing plus independent added tests16/16 and camera20/20 passed; inline no-overlay-raycast probe and scoped diff clean. Browser final verification pending.
- Remaining work / handoff: final independent Chrome visual/input acceptance and evaluator review; latest Stern/Silver Center label clarification pending.
