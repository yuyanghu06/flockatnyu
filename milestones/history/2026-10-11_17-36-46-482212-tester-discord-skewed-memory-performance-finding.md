# M18 independent skewed-data performance finding

- Local timestamp / acting role / milestone: 2026-10-11T17:36:46.482212-04:00 / independent tester / M18.
- Requested scope: Four-migration memory acceptance including representative108828-original/216-source scale and source/tier boundaries.
- Starting repository state:004proposed but not applied; uniform coderbenchmark passed; existing raw archive independently accepted.
- Work performed / changed files: Tester expanded tests/discord-memory.test.mjs and retained evidence/m18-discord-memory/performance-first-failure.log and migration-four-logic.log. Root inspected actual failed log and serialized journal.
- Decisions: Preserve the independent15second local performance budget; fix actual skewed/stale-statistics plan rather than changing permissions/timeouts or weakening checks. No hosted004apply yet.
- Checks and evidence: Four-migration logical subset17/17 passed, including optimizedRPC rollingmonth and bothDSTday lengths. Skewed108828-original/216-source test withoutANALYZE failed: grouping30001.5ms, fullrunexit1. LocalWASM timing does not itself establish hostedlatency.
- Resulting state / acceptance: Logical boundaries pass; performance blocks004acceptance. The prior uniform1.92x result alone is insufficient.
- Remaining work and handoff: Coder revises un-applied004 and examines actual stale-statistics queryplan; tester reruns unchangedscalebudget/invariants; evaluator waitsfinalplan/evidence. Existing108828originals and216checkpoints unchanged; Railwayoff.
