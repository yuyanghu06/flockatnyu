# maximum-safe-test-cleanup-complete

- Local timestamp / acting role / milestone: 2026-10-22T18:44:31.158574-04:00 / orchestrator / test-suite-cleanup.
- Requested scope: Remove as many obsolete/redundant tests as safely possible following the repository audit.
- Starting repository state: Existing dirty tree, previous audit and unrelated implementation work preserved.
- Work performed / changed files: Integrated maximum safe cleanup. Removed17standalone programs,13redundant Node cases,6stale/static standalone cases and13distinct obsolete optional model scenarios; added4meaningful asset cases and consolidated actual map behavior in9current browser scenarios. Current169Node files contain2450individual cases/2490reported results;37standalone programs remain. Preserved139historical SQL cases and43unchanged migrations. Production sources/assets/deployment settings unchanged by this cleanup.
- Decisions: Preserve meaningful current behavior and required historical SQL fixtures; use separate case/parent/standalone counts.
- Checks and evidence: Build passed; normal syntax/no-opt-in model invocation passed. Independent full/focused/76standalone/9browser evidence and evaluatorACCEPT inspected. Current CSV arithmetic/filecounts and scoped git diff --check pass. Detailed docs/test-suite-cleanup.md and docs/test-suite-inventory-after-cleanup.csv plus affected guides updated. No model inference, live club-source writes or deployment.
- Resulting state / acceptance: ACCEPT; requested cleanup complete.
- Remaining work and handoff: No required cleanup work remains. Optional live-model/physical-device evaluations were not needed for test deletion and were not performed. Subsequent product/deployment work remains under its own milestone.
