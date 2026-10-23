# Test cleanup: obsolete-test-assertions-cleaned

- Local timestamp / acting role / milestone: 2026-10-22T18:33:32.169535-04:00 / orchestrator / test-suite-cleanup.
- Requested scope: Remove as many obsolete/redundant tests as safely possible following prior audit.
- Starting repository state: Existing dirty tree and separate implementation/release work preserved.
- Work performed / changed files: Deleted4zeroassert capturetools, removed4obsolete optional model scenarios and stale gate assertions while preserving3personal-location SQL/projection cases. Removed5source-substring standalone checks and1obsolete camera-distance formula case; centralized config loading in tests/fixtures/map-config.mjs so actual relative imports work. Updated source-reading interaction fixture to use real configured buildings.
- Decisions: Preserve historical SQL fixtures and unique current behavior; remove obsolete checks rather than production behavior.
- Checks and evidence: Personal-location3/3pass. camera-focus20checks,map-presentation14,map-startup8,map-interactions16,global-center11,park-vegetation7run successfully with temp evidence; main full suite/replacement map browser still pending.
- Resulting state / acceptance: Bounded pass accepted; overall cleanup in progress.
- Remaining work and handoff: Complete GLB/browser consolidation, independent tests/evaluation, rebuild and updated inventory. No live source calls or deployment by cleanup.
