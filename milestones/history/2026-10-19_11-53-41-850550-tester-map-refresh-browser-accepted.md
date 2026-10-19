# Actual campus auto-refresh browser acceptance

- Local timestamp / acting role / milestone: 2026-10-19T11:53:41.850550-04:00 / independent tester / production map refresh.
- Scope/files: new tests/map-refresh-browser.mjs and evidence/production-map-refresh. No runtime or provider writes.
- Checks: actual Chrome10/10gates pass; synthetic native HTTP NDJSON tool stream and map API with the real campus. Upsert completed adds visible current avatar before answer completion without reload/camera reset; minimized attendance updates cards without early future avatars. Delayed old poll plus12notifications yields exactly1post-save read.503clears stale activity then recovers after1/3seconds; retries cap at2,403does not retry. Hidden writes defer to foreground; disposal cancels timers, requests and listeners. Nine landmarks retain complete bounds and pointer selection/orbit. Independent backend93/93and earlier41checks pass.
- Evidence: browser-results.json, synthetic avatar/recovery/overview screenshots. Parent inspected avatar-before-answer.png.
- Limitations: software WebGL/headless desktop; visibility getter controlled; no physical device or actual model calls. Hosted acceptance remains parent responsibility.
- Verdict/handoff: browser acceptance passes; protected web-only deployment authorized and ready.
