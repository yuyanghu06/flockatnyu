# browser-acceptance-and-regression-checks

- Local timestamp / acting role / milestone: 2026-10-10T20:05:25.9817818-04:00 / tester / M1.
- Requested scope: Independent production browser verification and failure-path checks.
- Starting repository state: Code and bounded evaluator fixes ready.
- Work performed / changed files: map_tester added tests/map-browser.mjs, source-geometry.mjs and folder guide; preserved source identification image; wrote production desktop, Paulson, mobile and failure screenshots plus JSON results.
- Decisions: Test actual input and rendered production assets; numeric tolerance for camera roundtrip. Default graphics measurement follows software-WebGL baseline separately.
- Checks and evidence: npm run build passed; 10 browser checks and 3 failure checks passed. All43 assets loaded, six landmarks selectable by canvas hover/click without forced camera movement; orbit/pan/zoom/reset, JSON restore, clipboard fallback, invalid input, mobile layout and resizing during pending load passed. Normal loading produced no page errors, missing requests or failed assets. Source connected components confirm92 Coles triangles;936 retained.327 distant grass triangles removed. Initial app load674ms. Software baseline375 draw calls/141826 triangles, about9FPS in headless Chrome154 Windows using SwiftShader; not a hardware-performance claim.
- Resulting state / acceptance: Functional browser acceptance passed. Desktop, selected Paulson and mobile screenshots reviewed by orchestrator; Paulson remains coarse source massing.
- Remaining work and handoff: Integrate evaluator final verdict, default-renderer measurement and user handoff. Evidence lives in evidence/m1-campus-map.
