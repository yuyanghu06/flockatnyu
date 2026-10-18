# Map presence final verification

- Local timestamp / acting role / milestone: 2026-10-17T16:23:14.750228-04:00; tester; map-presence-ui.
- Requested scope: independently verify protected map reads and avatar UI, including live hosted fixture and built assets.
- Starting state: backend cancellation and narrow row overlap fixes implemented; original source/branding edits preserved.
- Work performed: tester owns tests/map-presence.test.mjs, tests/map-presence-browser.mjs and evidence/map-presence-ui/. Stable production preview avoids concurrent Vite reloads; private live screenshots remain0600 under/tmp. No implementation/cloud writes, model calls or deployments.
- Checks and evidence:13/13 API/service/store checks;20/20 assistant regressions; frontend/API builds PASS. Latest production browser12/12 synthetic checks plus separate latest-build live verification5people/5hashed portraits loaded andHTTP200/9buildings/0pageerrors. Evidence includes browser-results.json, api-results.json, live-built-results.json and test-report.md.
- Decisions: distinguish harness HMR/fractional/stability/offscreen cleanup issues from the two repaired product findings. Tracked screenshots use synthetic identities.
- Resulting state / acceptance: PASS for local debugging. Desktop/mobile/narrow240/250, edge bounds, orbit/lift anchors, pointer/keyboard focus, refresh preservation, expiry/error clearing and recovery verified. No material unresolved findings.
- Remaining work and handoff: physical device/cross-engine/hardware performance untested. Temporary preview stopped; fresh paired dev server4187/API3127 transferred to primary as session70408, leaving older5173/3001 untouched.
