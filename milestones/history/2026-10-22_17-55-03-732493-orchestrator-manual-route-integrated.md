# Operator start/status routes integrated

- Local timestamp / acting role / milestone: 2026-10-22T17:55:03.732490-04:00 / orchestrator, serialized by orchestrator / manual-planner-start.
- Requested scope: force one existing staged planner cycle, optional channel whitelist overriding policy blacklist, queued originals only.
- Starting repository state: accepted independent contract; simplified/staged pipeline and concurrent dirty work preserved.
- Work performed / changed files: Added POST /api/planner/runs and GET /api/planner/runs/:runId with finite bounded JSON, no query/body grant fields and trusted server-owned plannerControl capability on the private shared operator. Existing admin check stays independent; no member-supplied capability is trusted. Status route has no-store headers; web runtime constructs metadata store only, never starts model work. Fixed oversized JSON body rejection to avoid awaiting an untrusted stream cancellation promise.
- Decisions: one configured bounded batch, no live history import or invented originals; omitted/empty whitelist retains normal sources. Ordinary map visibility for excluded-source participants stays unchanged.
- Checks and evidence: Parent route/security suite and adversarial body fix pass; independent130checks verify actual integration. No external source/model/Calendar changes in this implementation pass.
- Resulting state / acceptance: component/local test acceptance; independent final evaluation and hosted deployment not claimed by this pass.
- Remaining work and handoff: finish evaluator review and reviewed forward migrations/source-isolated rollout; preserve untouched tasks, ordinary source policies, budgets and concurrent work.
