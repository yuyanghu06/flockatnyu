# Agent pass report

- Milestone / role / scope: M2 independent tester; bounded camera, wider campus
  coverage, photo-informed Paulson architecture, selection and performance.
- Starting state and files inspected: startup instructions and tester role,
  milestones and M2 plan; M1 baseline source/tests/evidence; camera configuration,
  navigation implementation, expanded asset list, Paulson module, authoritative
  placement metadata and modeler's reference documentation. Opened actual
  exterior and facade reference photographs and compared rendered views.
- Work performed and changed files: added M2 browser scripts and evidence;
  updated stale baseline test fixtures and output destinations; added guides.
  No application, model, shared journal, reference photograph or M1 evidence edits.
- Decisions and assumptions: original camera distance is 240.97521330083552 m;
  assignment's 240.957 shorthand was a typo, confirmed with coder/orchestrator.
  Tests use real pointer drag/wheel/click with snapshot measurements. Bound-pan
  comparisons verify the camera-minus-target vector rather than a fixed angle.
- Checks / exact commands and outcomes:
  - `npm run build`: PASS after final palette change; 723.60 kB JS chunk gives
    Vite's nonfatal size warning.
  - `node tests/map-refinement.mjs`: six checks PASS. 121 jobs including 110
    tiles, no missing requests/page errors; 92 Coles triangles removed; recorded
    footprint and ground placement retained. Starting distance/FOV, orbit/reset,
    all four pan bounds, unchanged relative camera vector, in-bounds roundtrip,
    rejected outside target, all six canvas selections, and Paulson selection
    from three directions were exercised.
  - `node tests/map-boundary-zoom.mjs`: PASS. Restored a 700 m view at target
    X=430/Z=650; huge outward wheel input stays at 700 m and within target bounds.
    Subsequent actual orbit changes direction while preserving zoom. Screenshots
    show populated context at the tested edge views; this does not promise that
    all off-map backdrop is hidden at every possible horizon/angle.
  - `node tests/map-browser.mjs`: ten updated baseline checks PASS against M2,
    including six actual hover/click hits, camera JSON/fallback, mobile resize,
    and new model height/700 m boundary fixtures. This ran before the final
    material-only palette correction; no navigation or geometry changed afterward.
  - `node tests/map-failures.mjs`: three checks PASS. Bobst blocked deliberately:
    120 remaining jobs load with a visible error; resize while loading and no
    WebGL status both pass.
  - `node tests/map-paulson-views.mjs`: PASS on final production output. Three
    sides captured and clicked; eight meshes, 52,440 triangles, identical numeric
    bounds; no page errors. Final snapshots are in final-visual-results.json.
- Findings / fixes: first render revealed whole-floor glass bands because the
  bay coefficient was divisible by the modulo. Reported to modeler and fixed.
  Parent/modeler then refined overly strong checkerboard variation into coherent
  faculty/podium columns and individual student panels. Final screenshots were
  rebuilt, recaptured and inspected. The initial NW test point was behind a
  Silver Tower; using the visibly exposed faculty tower verified correct
  occlusion-aware raycasting. No app fix was needed for that test-point issue.
- Visual verdict: final model visibly replaces the uniform M1 slab with a low
  glazed base, roof terraces, separated unequal-height towers, window bays and
  pale fins. Muted blue-gray materials and vertical faculty glazing agree with
  the inspected exterior reference; staggered student panels approximate the
  close-up's relief. Ground and block placement remain aligned. Roof/setback
  dimensions, window pattern and box-shaped projections are approximations;
  exact angled glass, reflection, interiors and survey accuracy are not claimed.
  Nearby context is populated around Paulson and in the tested four pan corners.
- Performance: Chrome 154, Windows, 1440 x 1000, ANGLE NVIDIA GeForce RTX 5060 Ti
  Direct3D11. Final 90-frame sample mean 6.061 ms, p95 6.2 ms (~165 FPS), 396 draw
  calls, 180,426 rendered triangles at startup. The software baseline measured
  ~8.2 FPS; SwiftShader is not representative of hardware performance. These are
  short local observations, not mobile-device guarantees.
- Acceptance verdict and remaining work: PASS for bounded M2 refinement. Real
  mobile touch gestures and broad device coverage remain untested. The model is
  photo-informed rather than a detailed surveyed reconstruction. No deployment,
  roads, club events or integrations were added by this test pass.
- Folder-guide updates: tests/info.md and this evidence folder's info.md updated.
- Handoff: preview still available at http://127.0.0.1:4173/ (session 75444),
  HTTP 200 confirmed. Orchestrator should journal this pass and evaluator review;
  user can refresh and inspect Paulson using the landmark menu and Focus control.
