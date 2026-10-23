# Test cleanup: map-test-consolidation-plan

- Local timestamp / acting role / milestone: 2026-10-22T18:33:32.169066-04:00 / planner / test-suite-cleanup.
- Requested scope: Remove as many obsolete/redundant tests as safely possible following prior audit.
- Starting repository state: Existing dirty tree and separate implementation/release work preserved.
- Work performed / changed files: Preserve current GLB/placement/pointer/pan behavior in3asset cases and current browser harness; remove10old scripts after replacement passes,4captures and optionalsource diagnostic. Remove5source-substring checks; keep meaningful behavior suites.
- Decisions: Preserve historical SQL fixtures and unique current behavior; remove obsolete checks rather than production behavior.
- Checks and evidence: Read-only current source/harness comparison; no execution.
- Resulting state / acceptance: Bounded pass accepted; overall cleanup in progress.
- Remaining work and handoff: Complete GLB/browser consolidation, independent tests/evaluation, rebuild and updated inventory. No live source calls or deployment by cleanup.
