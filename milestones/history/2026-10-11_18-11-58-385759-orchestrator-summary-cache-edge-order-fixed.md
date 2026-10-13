# M20 cached coverage and edge ordering fixed

- Local timestamp / acting role / milestone: 2026-10-11T18:11:58.385759-04:00 / orchestrator / M20.
- Requested scope: Resolve independent evaluator resume finding.
- Starting repository state: SQL RPC reorders child edges; runner compared arrays in traversal order and could reject a valid cached mixed map/reduce layer.
- Work performed / changed files: summaries.js compares coverage/child references as sorted canonical multisets, retaining duplicate multiplicity. Ordered input hash remains unchanged. Tester assigned targeted SQL-order/coverage resume regression.
- Decisions: Evidence membership and DAG edges are unordered; model input sequence remains part of the hash. Invalid changed membership still fails.
- Checks and evidence: node --test tests/discord-summaries.test.mjs14/14passed. This current suite precedes the new explicit mixed-layer regression; independent tester owns that additional evidence. No model calls.
- Resulting state / acceptance: Focused fix passes existing tests; final independent SQL/scale/newregression/evaluator acceptance pending.
- Remaining work and handoff: Storage coder fixes stale-page pagination; tester verifies new resume case, then real pilot/all-manifest generation.
