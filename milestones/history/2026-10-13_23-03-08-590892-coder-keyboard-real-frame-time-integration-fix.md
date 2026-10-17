# Keyboard release deadline integration corrected

- Local timestamp / acting role / milestone: 2026-10-13_23-03-08-590892 / coder / M23 smooth WASD.
- Requested scope: WASD movement should feel smoother.
- Starting repository state: codex/dev at ff38922, prior functionality audit journal edits preserved.
- Work performed / changed files: Independent tester found main.animate forwarded capped delta, defeating the keyboard modules real elapsed release cutoff after a suspended frame. Coder changed only the keyboard update call to elapsedSeconds and clarified documentation; module still caps travel internally.
- Decisions: Preserve camera-relative movement, bounds, source geometry, existing backend and unrelated user changes.
- Checks and evidence: Coder source syntax and diff checks pass. Root fresh production rebuild passes. Tester strict numerical and caller regression plus fresh browser rerun target final build; other frontend components keep capped deltas.
- Resulting state / acceptance: Material integration finding fixed; final acceptance still pending tests/review. No geometry/backend changes.
- Remaining work and handoff: Complete independent browser/caller checks, preserved14check regression and final evaluator.
