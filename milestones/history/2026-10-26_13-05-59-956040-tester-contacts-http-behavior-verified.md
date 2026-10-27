# Contacts http behavior verified

- Local timestamp / acting role / milestone: 2026-10-26T13:05:59.956040-04:00 / tester / contacts-ui.
- Requested scope: Verify complete contact UI/API and style guide.
- Starting repository state: API and style guide implemented, frontend in progress. Existing work preserved.
- Work performed / changed files: Independent four grouped API checks execute actual Hono routes and the real contacts store over simulated PostgREST. Cover CRUD/projection, exact microsecond versions, legacy and other-contact preservation, rejected stale/invalid fields/queries, actual production session/origin and precise local GET exemptions, no Discord dependency, empty/unavailable/conflict/unknown outcomes.
- Checks and evidence: node --test tests/contacts-http.test.mjs passes. New synthetic fixture tests/fixtures/contacts-ui.mjs. Browser harness still in progress; no live data requests.
- Resulting state / acceptance: API behavior verified; frontend acceptance pending the identified fixes and browser verification.
- Remaining work and handoff: Fix create-only validation/draft reload retries; independently retest actual browser flows and visuals, then final evaluation.
