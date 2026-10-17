# Numerical WASD checks pass; software browser limit identified

- Local timestamp / acting role / milestone: 2026-10-13_23-01-35-883096 / tester / M23 smooth WASD.
- Requested scope: WASD movement should feel smoother.
- Starting repository state: codex/dev at ff38922, prior functionality audit journal edits preserved.
- Work performed / changed files: Independent tester updated owned keyboard suite and added browser motion trace checks. Numerical checks passed. First1440×1000 forced SwiftShader run rendered at roughly3FPS with283–333ms frame gaps, preventing valid acceleration samples; no motion-quality acceptance inferred.
- Decisions: Preserve camera-relative movement, bounds, source geometry, existing backend and unrelated user changes.
- Checks and evidence: Independent keyboard13/13 passed. Software-browser attempt lacked enough sub90ms frames to assess easing. Initial failure/limitations saved in new M23 evidence. Tester reruns default graphics with a smaller viewport; root production build and47 other frontend assertions already pass.
- Resulting state / acceptance: Numerical behavior accepted for dependent verification; browser motion verification still open. The recorded browser limit is environmental, not established implementation failure.
- Remaining work and handoff: Complete default-graphics browser checks and preserved startup/input/grouping regression, then independent review.
