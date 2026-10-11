# Agent pass report

- Milestone / role / scope: M4 independent tester; Kimmel, Silver Center, Gould
  planting, original tower restoration, ten-landmark interactions and navigation.
- Starting state and files inspected: AGENTS, rolling milestone/to-do/latest
  history, workflow/tester role and report template; main/config/new model modules;
  Kimmel and Silver reference guides and actual reference photos; prior M3 tests.
- Work performed and changed files: created `tests/map-m4.mjs`, final test logs,
  JSON results, screenshots, this report and evidence guide. No app/source/shared
  journal edits; no agents or deployment.
- Decisions and assumptions: use actual production preview and hardware-backed
  headless Chrome; numeric camera tolerance, real raycast clicks, independent
  source decoding; elevated side cameras clear neighboring buildings.
- Checks: `npm run build` exit0, existing Vite large-chunk advisory remains.
  `node tests/map-m4.mjs` exit0, eight groups pass; optional targeted visual command
  in info.md exit0. Ten menu/focus/hover/click sequences pass; orbit, bounded pan
  preserving relative vector, valid restore/invalid rejection and mobile pass.
  Exact source/model counts and performance are in browser-results.json.
- Findings / failures / unavailable checks: actual Gould Focus occlusion reported
  and fixed by parent, then verified by screenshot and click. Initial side-camera
  occlusion resolved by test camera changes. No final browser errors or missing
  assets. Source photo fidelity remains approximate; physical mobile performance
  and touch, current access, and exhaustive obscured rear faces are not certified.
- Acceptance verdict and remaining work: pass for the requested map-preview scope.
  No material test blocker remains. Root/evaluator should retain stated visual
  approximation and partial courtyard occlusion limits when accepting milestone.
- Folder-guide updates needed: this evidence guide added. Parent should link M4
  command from shared tests/info.md; older milestone-specific tests retain historical
  nine-landmark/tower fixtures and should not be presented as current M4 acceptance.
- Handoff: preview http://127.0.0.1:4173/ remains HTTP200, PID10628/session15694.
  Parent owns journal integration; reviewer has final screenshot/result locations.
