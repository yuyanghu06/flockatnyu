# Production map refresh verification

Independent local acceptance of the production unavailable-card and delayed-avatar repair. Only synthetic people and events appear in screenshots. No model/source calls or hosted writes are performed by these tests.

- `browser-results.json` and `browser-run.log`: actual campus and assistant in Chrome 155, native incremental NDJSON HTTP fixture, 10 passing checks.
- `avatar-before-answer.png`: a current person is visible after completed upsert while the answer stream is still open.
- `future-attendance-no-current-avatar.png`: future attendees appear on their event card without an early current avatar.
- `coalesced-fresh-avatars.png`: delayed stale read followed by exactly one fresh read after twelve write notifications.
- `transient-unavailable.png` / `automatic-recovery.png`: stale activity is cleared and the card/avatars recover automatically after temporary API failure.
- `overview-after-refresh.png`: overview/orbit remains usable and campus model alignment is retained.
- `independent-node.log` / `independent-backend.log`: 41 frontend/protocol/projection cases and 93 final backend cases pass independently.
- `verified-sha256.txt`: exact sources and test exercised in the final run.
- `independent-report.md`: scope, commands, results and remaining limitations.

Reproduce with `node tests/map-refresh-browser.mjs` from the repository root. It starts and closes its own Vite/HTTP/Chrome processes, and uses installed Chrome by default (`CHROME_PATH` overrides the executable).

The orchestrator owns any separate hosted release receipt in this folder. Local synthetic acceptance does not prove hosted deployment or arbitrary model behavior.

Hosted release receipt verifies web9be6ab23SUCCESS, five authenticated200reads, anonymous403, byte-exact built assets and actual protected Chrome Bobst card/9landmarks/0errors. No real activity/model writes were made; private production screenshot remains in temporary storage outside Git. regression-summary.json records the1209test full run, independent checks and sanitized package scan.
