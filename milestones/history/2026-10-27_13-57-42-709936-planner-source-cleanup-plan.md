# Source organization and CI plan accepted

- Local timestamp / acting role: 2026-10-27_13-57-42-709936 / planner.
- Scope: independent read-only planner inspected frontend, HTTP routes, deployment, tests and current quality commands.
- Plan: group browser code under app/features/map; server-only handlers under src/api by provider. Preserve routes, auth, source permissions, exact writes, all UI/map behavior and dormant Treg 404s. Update asset paths, test imports and deployment reachability.
- Limits: 500 physical lines per JavaScript module, 400 CSS; split oversized src files. Explicit frozen per-file exceptions for existing oversized backend/tests; no blanket legacy exclusion.
- Checks: standard formatting/lint/size, offline behavior tests, builds, packaging and synthetic browser smoke. No live-service calls or model evaluation required for unchanged prompts.
- Next: finish initial main publication, then two exclusive implementation assignments plus root CI work.
