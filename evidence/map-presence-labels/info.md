# Table-driven map presence label verification

This folder records the explicit `people_here[].label` contract, independently exercised against real local PostgreSQL-compatible SQL, the API, and browser UI. Synthetic people are used in all tracked screenshots; actual roster identities and portraits remain in private temporary screenshots.

- `tests-results.json`: exact commands and aggregate local SQL/API/roster/build results.
- `browser-regressions.json`: 15 passing synthetic browser checks against the first label build, including existing loading, pointer/keyboard selection, camera transitions, complete-building lift, roof alignment, resizing, expiry and failure recovery. Its earlier 100px long-label width was subsequently narrowed; use the final focused report below for current label geometry.
- `browser-labels-focused.json`: four passing checks against the final 50px desktop/40px mobile badge build. Arbitrary text, spaces, Unicode and literal HTML are preserved; blank labels hide badge and context; five neighboring 200-code-point labels do not overlap on a 390px viewport and full text remains in details.
- `browser-results.json`: duplicate final focused result retained as the browser runner's conventional output.
- `browser-live.json`: read-only post-migration browser result for five Bobst entries and five loaded portraits; contains aggregate results only.
- `synthetic-*.png`: synthetic desktop/mobile, narrow/edge, literal-text and long-label captures. Final focused runs refreshed the label-specific screenshots. Existing map geometry/materials remain intact.
- `hosted-verification.json`: orchestrator-owned hosted migration receipt, data-preservation and privilege verification. The tester did not apply migrations or write cloud data.

Browser verification used Chrome 155 with software WebGL. Viewports emulate mobile; no physical-device performance or touch measurements are claimed. No model calls, deployment, agent-tool exposure or map data writes were performed by the tester.
