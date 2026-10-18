# Map presence wrapped layout fixed

- Local timestamp / acting role / milestone: 2026-10-17T16:20:15.743064-04:00; coder; map-presence-ui.
- Requested scope: prevent portrait overlap between wrapped fan rows.
- Starting state: narrow four-column layout had insufficient vertical separation.
- Work performed: frontend coder changed only src/map-presence.js; row pitch now adds26px to reserve curvature while keeping shared roof anchor and viewport constraints.
- Checks and evidence: calculated narrow example center distance59.55px; fresh frontend build, syntax and scoped whitespace PASS.
- Resulting state / acceptance: focused fix complete; tester verifies actual240/250px wrapped layout on stable production preview.
- Remaining work and handoff: final browser results and read-only evaluator acceptance before integration.
