# Smooth faster WASD integrated and verified

- Local timestamp / acting role / milestone: 2026-10-13_23-08-26-024761 / orchestrator / M23 smooth WASD.
- Requested scope: WASD movement should feel smoother.
- Starting repository state: codex/dev at ff38922, prior functionality audit journal edits preserved.
- Work performed / changed files: Inspected final source/evidence and overview image, incorporated planner/coder/tester/evaluator reports. Root adjusted existing map-input regression settling120→300ms and normal Chrome graphics by default (software explicit opt-in) without changing acceptance assertions. Updated affected guides and serialized journal. Prior functionality audit edits preserved.
- Decisions: Preserve camera-relative movement, bounds, source geometry, existing backend and unrelated user changes.
- Checks and evidence: Production build passes. Startup9, camera21, interaction16 and independentkeyboard14 assert60total; independentChrome16 and rootpreservedChrome14 pass30total, no JS errors. git diff --check passes. Root first forced-software short held-key probe failed under low frame rate; unchanged assertions pass normal graphics. Earlier47 count for9+21+16 corrected to46 in this append-only entry. Normal graphics/measurement/selection-fixture corrections and implementation caller fix are recorded; initial failure evidence preserved.
- Resulting state / acceptance: M23 complete; final evaluator accepts, material finding resolved/retested. Source/assets/geometry/backend boundary maintained. Work remains local/uncommitted; preview4183 available.
- Remaining work and handoff: User feedback on speed/easing; preserve separate auth/RAG/integration and summary-cron follow-ups.
