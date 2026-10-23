# Plain task-cache contract accepted

- Local timestamp / acting role / milestone: 2026-10-22T18:20:22.191383-04:00 / planner report integrated by orchestrator / plain-task-cache-read.
- Requested scope: return saved task data without bundling live reads; the model selects standard source/action tools afterward.
- Starting repository state: tool-error change locally verified, not deployed; task reads/catalogue/defer currently invoke repeated live authorization callbacks.
- Work performed / changed files: read-only planner inspected pipeline/store/adapters/handler/prompt and tests. No edits or external calls. Parent inspected actual callback wiring and agreed bounded contract.
- Decisions: local cached task eligibility checks only (shape, scope, expiry, trusted batch/read-task input bindings, principal/cancellation). Remove pipeline authorizeInputs/authorizeTask callbacks from catalogue/read/defer; keep normal tools' own checks and runner leases. bindTask is in-memory only. Retain targeted verifyResolution actual-outcome checks before exact-version deletion. No new schema, RPC, cache/source tool, budgets or sweeping authorization changes.
- Checks and evidence: code inspection locates current(task), save and afterInitial loops in staged-pipeline.js and callbacks in adapters.js. Existing task-store already supplies service-only scoped/versioned persistence. Planner ran no tests.
- Resulting state / acceptance: contract accepted; coder owns staged-pipeline.js, adapters.js, prompt.js and automation/info.md; tester owns focused new plain-cache tests plus staged-pipeline/staged-runtime tests and tests/info.md.
- Remaining work and handoff: independently prove zero task-source I/O, unchanged cached contents/receipts, local scope denials and normal tool authorization; build/repackage/review/deploy combined worker.
