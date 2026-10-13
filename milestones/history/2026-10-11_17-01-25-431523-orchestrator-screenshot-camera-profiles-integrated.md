# Screenshot camera profiles integrated

- Local timestamp / acting role / milestone: 2026-10-11T17:01:25.431523-04:00 / orchestrator / M19 building views.
- Requested scope: Stern25%, Courant/Bobst/Kimmel/GCASL/Paulson/Leslie20% lower screenshot-derived views, screen-wide return.
- Starting state: concurrent Discord/backend work present; preserved.
- Work performed / changed files: src/building-views.js adds seven original azimuth/polar/height profiles; camera-focus.js lowers target-relative Y once and retains horizontal offset from original fit; main.js supplies window wheel target. Existing camera-focus test expectations now honor profiles and output accepts MAP_EVIDENCE.
- Decisions: screenshot reconstruction is approximate; lowered offset also decreases distance. Remaining four building profiles unchanged. Latest image labeled Stern appears Silver Center; optional clarification pending.
- Checks and evidence: MAP_EVIDENCE=evidence/m19-building-views node tests/camera-focus.mjs 20/20 after correcting existing generic-polar expectations; evidence/clickfocus-results.json saved.
- Acceptance: numerical camera/motion invariants passed. Independent Chrome visual/input checks pending.
- Limitations: user enabled AppleEvents JS and local tab84171734 accessible; reload currently remains loading. Independent tester fresh Chrome reached Ready with no pageerrors/requestfailures. No hosted/source changes.
- Handoff: investigate user-tab readiness, compare seven angles, verify actual screen wheel, evaluator review.
