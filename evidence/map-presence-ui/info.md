# Map presence verification

This folder contains independent test evidence for database-backed people markers at Bobst. Tracked screenshots contain synthetic people and initials only. The live portrait screenshot stays in a temporary file with mode 0600.

- `api-results.json`: 13 focused service/store/API tests, 20 assistant regression tests, and successful frontend/API build commands. Covers production exclusion of the debug fixture, current source-policy checks, privacy, cancellation, expiry, and bounded failures.
- `browser-results.json`: final stable production-preview run; all 12 synthetic browser checks passed. Includes pointer and keyboard activation, refresh focus preservation, roof alignment during orbit/lift, 390px mobile, 250/240px wrapping, edge bounds, expiry, failure recovery and safe fallback.
- `live-built-results.json`: separate final browser check against the real hosted fixture through the freshly restarted local API. Records counts only: five people, five loaded hashed production portrait URLs returning HTTP 200, nine building records, no page errors.
- `synthetic-*.png`: desktop, mobile, narrow and edge screenshots with synthetic identities.
- `initial-browser-diagnostic.json`: invalidated development run retained for transparency. Vite reloaded while files changed; test assertions were corrected for fractional CSS bounds and software-rendered motion.
- `built-browser-before-wrap-fix.json`: intermediate stable-preview run. Its live production portrait check passed. Remaining failures were harness stability/offscreen cleanup issues; the final synthetic run supersedes them. A separate review found overlapping wrapped rows, fixed by the frontend coder and exercised by the final 250/240px check.
- `test-report.md`: report for the orchestrator's journal.

The tester made no cloud writes or application changes. The orchestrator seeded five explicitly marked planned test locations, expiring at `2026-10-18T20:13:44.113Z`; these do not assert actual presence. Production excludes this debug fixture. Testing used headless installed Chrome with software WebGL and emulated viewport sizes; physical touch devices and performance benchmarks were not exercised.

To reproduce all browser checks, run the development API with an appropriate configured environment, build the frontend, serve Vite preview with the same `PORT`, and run `MAP_URL=http://127.0.0.1:4188 node tests/map-presence-browser.mjs`. The default script includes the live fixture check; `MAP_SKIP_LIVE=true` runs synthetic browser checks only.
