# Agent pass report

- Milestone / role / scope: M1 independent tester; production browser acceptance
  and source replacement-geometry audit for the first local campus preview.
- Starting state and files inspected: AGENTS.md, tester role, workflow, current
  milestones/history, initial-map prompt, assignment/report templates, asset
  README/manifest, landmark placements, Paulson metadata, and new application
  source. Application was being implemented; existing source-identification
  screenshot was preserved.
- Work performed and changed files: added `tests/` scripts and folder guide;
  wrote only new evidence and browser captures in this evidence folder. No app,
  package, source assets, shared journal, deployments or integration edits.
- Decisions and assumptions: tested the Vite production output on loopback.
  Camera comparisons use 1e-8 tolerance because OrbitControls produces harmless
  floating-point differences. Test pointer actions are real canvas events;
  read-only debug snapshots supply state and numerical evidence.
- Checks: `npm run build` passed, with the existing 679 kB JavaScript chunk-size
  warning. `npm run preview -- --host 127.0.0.1` started the production server at
  http://127.0.0.1:4173/ (exec session 75444, intentionally left running).
  `node tests/map-browser.mjs` passed ten checks: 43 assets without page errors,
  failed requests or HTTP errors; metadata-derived landmark bounds; all six
  menu selections without forced camera movement; actual orbit/pan/wheel/reset;
  camera copy/restore, invalid JSON and denied-clipboard fallback; selected
  Paulson capture; boundary-camera restoration; actual canvas hover/click on
  each of the six landmarks; render measurements; and 390 x 844 resize/usability.
  `node tests/map-failures.mjs` passed three checks: blocked Paulson yields 42
  loaded assets and visible failure; resize during delayed asset loading yields
  correct final canvas; unavailable WebGL yields readable instructions.
  `node tests/source-geometry.mjs` passed: source tile has 1028 triangles;
  six connected shells intersecting Coles contain 19+8+42+2+19+2=92 triangles.
  Runtime removes 92. A strict centroid test finds only 45 because walls lie on
  the boundary; all identified source shells lie at recorded Coles elevations.
  The evaluator separately verified 936 retained triangles and no shared
  vertices across removed/retained geometry.
- Findings / failures / unavailable checks: first failure pass reproduced a
  1200 x 900 canvas after viewport resize to 390 x 844 during loading. Coder fixed
  listener timing; final retest passes. Evaluator's boundary-camera precision
  fix also passes browser restoration. Earlier strict-equality test assertions
  were corrected to the specified numeric tolerance; this was a test issue.
  Visual inspection shows aligned park/arch/Bobst and campus landmarks, with
  Paulson on its recorded block and no visible old Coles duplicate. Its simple
  32-triangle prism remains a source-model limitation, not detailed architecture.
  Physical mobile devices, touch gestures, GPU variations and original Mac
  source-scene/extraction replay were not tested in this Windows pass.
- Performance evidence: Windows Chrome headless at 1440 x 1000. Final SwiftShader
  sample: 89 frame intervals, mean 111.20 ms, p95 121.2 ms (~8.99 FPS), 375 draw
  calls and 141826 triangles. This is software rendering. Separate default GPU
  run identifies ANGLE NVIDIA GeForce RTX 5060 Ti / Direct3D11: 60 intervals,
  mean 6.06 ms, p95 6.2 ms (~165 FPS), same draw/triangle counts. These are short
  local observations, not guarantees for member devices. Final software suite
  observed 1568 ms navigation-to-ready-and-settle time; raw application loading
  time is recorded separately in browser-results.json.
- Acceptance verdict and remaining work: PASS for the implemented first local
  preview, with documented fidelity and device-testing limits. Higher-detail
  Paulson geometry remains future work. No fabricated club activity appears.
- Folder-guide updates needed: tests/info.md and this folder's info.md updated.
  Orchestrator must serialize this pass into milestone/history tracking.
- Handoff and recommended next action: inspect final screenshots, accept the
  preview milestone at its bounded scope, give the user the local URL and
  Camera angle → Copy camera workflow for selecting the next desired angle.
