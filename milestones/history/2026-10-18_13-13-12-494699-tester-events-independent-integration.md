# Dedicated events: events-independent-integration

- Local timestamp / acting role / milestone: 2026-10-18T13:13:12.494699-04:00 / tester / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Independent tester accepted normalized event implementation. npm run test:map-events passed57/57; npm run test:agent-automation passed138/138. tests/events-browser.mjs executes real001–027SQL through store/service/current-source authorizer/Hono/Vite/installed Chrome:12/12 checks pass, including all-linked-buildings visibility, simultaneous locations, overlap deduplication, current/future/same-building return schedules, event portraits, source revocation,201events and Tokyo all-day date. Browser/page/console/request errors are zero. Five tracked screenshots are synthetic; root inspected actual live private screenshot separately. Tester wrote only owned test/evidence files and closed own resources. Evidence in evidence/events-relationships/test-report.md and browser-report.json. No tester cloud writes/deployment/model calls.

