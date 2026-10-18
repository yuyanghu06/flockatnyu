# Map presence cancellation finding

- Local timestamp / acting role / milestone: 2026-10-17T16:16:48.893055-04:00; tester; map-presence-ui.
- Requested scope: independent API/store/service and browser acceptance.
- Starting state: code implemented; hosted debug fixture ready.
- Work performed: tester wrote meaningful API/service/store checks; no product-code edits.
- Checks and evidence:12behavior assertions passed but suite exit1 from unhandled rejection after a pre-aborted request; primary reproduced with node --test tests/map-presence.test.mjs.
- Decisions: treat request cancellation error as a release-blocking bug, not a test failure to suppress.
- Resulting state / acceptance: fix requested from backend owner; browser checks continue independently.
- Remaining work and handoff: repair abort/race ordering and independently rerun suite.
