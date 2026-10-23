# Isolated exact-channel whitelist implemented

- Local timestamp / acting role / milestone: 2026-10-22T17:55:03.732490-04:00 / coder, serialized by orchestrator / manual-planner-start.
- Requested scope: force one existing staged planner cycle, optional channel whitelist overriding policy blacklist, queued originals only.
- Starting repository state: accepted independent contract; simplified/staged pipeline and concurrent dirty work preserved.
- Work performed / changed files: Added discord/manual-scope.js, scoped adapter wiring and read-only043metadata RPC/store method. Exact selected Discord UUIDs replace unrelated source grants and Gmail; only pinned Calendar dependencies remain. Facade overrides channel/category exclusions per run while rechecking current published metadata, real bot permissions, guild/ancestry, pause/manual disables/withdrawal. No global policy/publication/source identity changes; missing UUID yields no queued grant.
- Decisions: one configured bounded batch, no live history import or invented originals; omitted/empty whitelist retains normal sources. Ordinary map visibility for excluded-source participants stays unchanged.
- Checks and evidence: Coder83focused checks, JS syntax/whitespace and disposable SQL043selected/ancestor-only projection and service ACL probe pass.
- Resulting state / acceptance: component/local test acceptance; independent final evaluation and hosted deployment not claimed by this pass.
- Remaining work and handoff: finish evaluator review and reviewed forward migrations/source-isolated rollout; preserve untouched tasks, ordinary source policies, budgets and concurrent work.
