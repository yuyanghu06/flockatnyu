# Agent pass report

- Milestone / role / scope: M6 independent tester; mapped roads, sidewalks, paths,
  park surfaces, close-zoom appearance and existing map interaction regression.
- Starting state and files inspected: AGENTS/tester role/report template,
  milestone/to-do/latest history/workflow and Git state; raw streets-parks data,
  data/rendering guides, streets/parks integration and source arch placement.
- Work performed and changed files: tests/map-m6.mjs and non-reference evidence
  in this folder. Captured M5 before views before integration; same-pose M6 views,
  outer-park and low-curb views, numerical source/baked-geometry tests. No app,
  shared journal, source-data changes, deployment or spawned agents.
- Decisions and assumptions: source counts are segments/surface parts, not unique
  streets/parks. Same-pose captures for comparison; separate actual raycast tests
  for ten landmarks. Final metadata rebake tested narrowly after full acceptance.
- Checks: npm run build exit0; node tests/map-m6.mjs exit0 with10/10 groups. Final
  MAP_CHECKS='offline projection|baked environment|low close',MAP_RUN='final'
  invocation exit0 with3/3. Final parkCount52/surfacePartCount558 and baked
  10meshes/230451 triangles confirmed. Exact commands/evidence in info.md.
- Findings / failures / unavailable checks: early old camera bounds prevented
  outer-park close views; parent expanded them and regression passed. Fountain
  overlap risk flagged before acceptance; final geometry leaves center clear and
  visible bowl intact. Arch maximum discrepancy0.000547m, below0.001m. No final
  errors/missing assets or material visual blocker. Map completeness/widths,
  current access and physical-mobile performance remain unverified; not all tiny
  surface parts or input holes individually inspected. Existing tree placement
  and ground-only new park detail are explicit limits.
- Acceptance verdict and remaining work: pass for requested bounded map-preview
  streets/paths/park-surface scope. Full results retained, final targeted metadata
  and low-camera evidence supersede the earlier misleading parkCount label.
- Folder-guide updates needed: this evidence/info.md added. Parent updates shared
  tests/evidence guides and serializes milestone journal.
- Handoff: evaluator notified; final after-final-results.json and screenshots are
  ready. Preview HTTP200 at http://127.0.0.1:4173/,session15694/PID10628.
