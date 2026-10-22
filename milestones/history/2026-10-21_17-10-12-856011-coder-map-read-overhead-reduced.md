# Map read overhead reduced locally

- Local timestamp / acting role / milestone: 2026-10-21T17:10:12.856011-04:00 / coder / tool failure diagnostics.
- Requested scope: reduce map-read overhead while preserving authorization and optimistic writes.
- Starting state: existing diagnostics and unrelated dirty-tree work preserved.
- Changed files: server/map/events.js and info.md; tools/map/index.js and parent guide; tests/map-event-read-performance.test.mjs; parent corrected stale source-access comment.
- Work performed / evidence: Trusted map reads now reuse one validated-snapshot authorization scope and exact original checks, preindex relationships, and authorize events then eligible participation with at most four workers per phase. Snapshot order, filtering, per-call fresh checks, exact attendance bindings and both uncached write authorization passes remain. Eight new security/performance cases plus existing focused suite pass56/56 and API build/whitespace pass. Parent broader72test run exposed one older timeout assertion missing the intentionally added safe diagnostics; tester assigned that fixture correction. Synthetic providers only; no live latency measurement or deployment.
- Commands: node --test tests/map-event-read-performance.test.mjs tests/map-source-access.test.mjs tests/events-service.test.mjs tests/map-failure-diagnostics.test.mjs tests/map-event-tools.test.mjs tests/update-agent-map.test.mjs; npm run build:api; scoped git diff --check.
- Result / remaining work: implementation complete, independent combined verification and evaluation underway.
