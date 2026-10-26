# Expired task fixture uses one stable statement clock

- Local timestamp / acting role / milestone: 2026-10-26T12:08:08.248831-04:00 / Coder / main-publication-2026-10-26.
- Requested scope: fix the intermittent offline expiry fixture discovered during pre-publication checks.
- Starting state: combined test run hit agent_pending_tasks_check before the intended expiry assertion; standalone replay passed, supporting a timing-dependent fixture.
- Changed file: tests/agent-task-history-storage.test.mjs:88 only. All three fixture clock_timestamp() calls use statement_timestamp(), preserving the exact24hour lifetime and every existing stale/source/lease/expiry assertion. Production code is unchanged.
- Checks and evidence: node --test tests/agent-task-history-storage.test.mjs passed22/22,0failed,exit0 in2.43seconds. Root inspected the exact one-line diff. Independent Tester rerun is in progress.
- Resulting state / acceptance: bounded correction implemented; final publication awaits independent retest/evaluation.
- Remaining work and handoff: integrated offline rerun, evaluator acceptance, logical commits and normal main push. No live writes, schema application or additional tests were added.
