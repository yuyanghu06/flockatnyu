# Repository test-suite audit integrated

- Local timestamp / acting role / milestone: 2026-10-22T18:28:08.695958-04:00 / orchestrator / test-suite-audit.
- Requested scope: Full repository test inventory, high-level coverage, legacy classification and safe deletion recommendations.
- Starting repository state: Existing dirty working tree and concurrent cache implementation preserved.
- Work performed / changed files: Completed requested audit and saved docs/test-suite-audit.md plus per-file CSV.13conservative case removals are8retired-helper-only checks and5duplicate no-Miro variants; preserve139historical SQL cases. Two mixed failing tests need updates, not deletion. Seven old harnesses contain56additional historical checks; extract useful checks first. Four obsolete capture tools have zero test cases.
- Decisions: Use separate individual-case, parent-test and standalone-script counts; no cleanup implementation authorized by this audit request.
- Checks and evidence: Parent verified CSV arithmetic/168rows/historical counts, inspected evidence and independent reports; git diff --check on owned report/guide/journal paths passes. No application/test changes, live calls, source writes, deployment or deletion by this audit.
- Resulting state / acceptance: Audit pass accepted, including explicit test failures and scope limits.
- Remaining work and handoff: User receives counts, high-level coverage, exact cleanup recommendation and limitations. Actual cleanup remains a separate requested task; ongoing cache/release work below is untouched.
