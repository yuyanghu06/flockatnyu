# Durable request and forced claim implemented

- Local timestamp / acting role / milestone: 2026-10-22T17:55:03.732490-04:00 / coder, serialized by orchestrator / manual-planner-start.
- Requested scope: force one existing staged planner cycle, optional channel whitelist overriding policy blacklist, queued originals only.
- Starting repository state: accepted independent contract; simplified/staged pipeline and concurrent dirty work preserved.
- Work performed / changed files: Added automation/manual-runs.js and manual-worker.js, extended store/CLI and new042. Metadata requests retain24hours with20active cap and15minute fenced request reservations; worker polls requests first, requeues busy/aborted requests, uses standard isolated bundled runtime and existing global lease. Forced claim skips threshold/cooldown only, preserving retry/quarantine/snapshot/input/byte safeguards. No history fetch or direct source writes. Parent audit logger is reused; manual runtimes create no extra maintenance interval.
- Decisions: one configured bounded batch, no live history import or invented originals; omitted/empty whitelist retains normal sources. Ordinary map visibility for excluded-source participants stays unchanged.
- Checks and evidence: Coder51existing focused and36new checks pass; API build/syntax/whitespace pass.
- Resulting state / acceptance: component/local test acceptance; independent final evaluation and hosted deployment not claimed by this pass.
- Remaining work and handoff: finish evaluator review and reviewed forward migrations/source-isolated rollout; preserve untouched tasks, ordinary source policies, budgets and concurrent work.
