# Read-only retired-feature audit

- Local timestamp / acting role / milestone: 2026-10-22T18:23:58.918503-04:00 / planner / test-suite-audit.
- Requested scope: Count and classify repository tests; recommend safe deletions without changing tests.
- Starting repository state: Large pre-existing dirty tree; separate task-cache implementation underway.
- Work performed / changed files: Read-only specialist pass; orchestrator records this report. No application or test edits.
- Decisions: Identified147historical leaf cases across15files, excluding13grouping parents;5active leaf cases share mixed files. Eight pure frozen JavaScript helper/adapter cases can be removed while preserving139historical SQL cases and required fixtures. Production runtime does not import frozen test fixtures.
- Checks and evidence: Static file/dependency review only; no tests run by this specialist.
- Resulting state / acceptance: Audit finding accepted; no cleanup or whole-suite green claim.
- Remaining work and handoff: Full runtime inventory and standalone-browser review remain pending.
