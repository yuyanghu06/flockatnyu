# Test cleanup: thirteen-redundant-tests-removed

- Local timestamp / acting role / milestone: 2026-10-22T18:33:32.169414-04:00 / coder / test-suite-cleanup.
- Requested scope: Remove as many obsolete/redundant tests as safely possible following prior audit.
- Starting repository state: Existing dirty tree and separate implementation/release work preserved.
- Work performed / changed files: Removed exactly13Node leaf cases in4owned files:8retired-helper and5unused-status variants. Every retained historical SQL block remains byte-identical.
- Decisions: Preserve historical SQL fixtures and unique current behavior; remove obsolete checks rather than production behavior.
- Checks and evidence: Clean inert4file run:40reported tests/38leaf/2parents,allpass,66.55seconds;scopedwhitespacepass.
- Resulting state / acceptance: Bounded pass accepted; overall cleanup in progress.
- Remaining work and handoff: Complete GLB/browser consolidation, independent tests/evaluation, rebuild and updated inventory. No live source calls or deployment by cleanup.
