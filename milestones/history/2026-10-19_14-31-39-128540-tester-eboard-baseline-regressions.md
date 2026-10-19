# Existing Discord runtime and historical schema regressions pass

- Local timestamp / acting role / milestone: 2026-10-19T14:31:39.128540-04:00 / orchestrator performing baseline testing / eboard-discovery-availability.
- Requested scope: prevent regressions while repairing discovery availability.
- Starting repository state: forward migration035 and its independent tests are still being authored; application JavaScript is unchanged.
- Work performed / changed files: ran all existing Discord tests and API build; added draft guide explanation clearly marked as local/pending hosted application.
- Decisions: preserve all applied migrations and historical test expectations; new publication semantics are verified separately against035.
- Checks and evidence: node --test tests/discord*.test.mjs passed600/600,0failed. npm run build:api passed syntax/runtime dependency checks. git diff --check passed. These baseline tests do not include035 and do not establish live repair.
- Resulting state / acceptance: baseline accepted; no runtime regressions observed before035integration.
- Remaining work and handoff: independent035SQL/runtime tests, evaluator acceptance and legitimate hosted readback/application remain pending.
