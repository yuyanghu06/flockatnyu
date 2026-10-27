# Approved Contacts design site release planned

- Local timestamp / acting role / milestone: 2026-10-26T15:36:28.573410-04:00 / planner / contacts-site-release.
- Requested scope: User approved the mock and requested putting it on the site. This authorizes real Contacts UI integration and website publication.
- Starting repository state: Approved mock isolated; actual UI/backend additions remain local and many earlier uncommitted changes must be preserved. Live web is 408f84bb with no staged changes.
- Work performed / changed files: Read-only comparison of real/mock UI, browser harness, runtime wiring and package/deployment setup. Assigned src/contacts.js/css exclusively to coder and tests/contacts-ui-browser.mjs to tester; root owns builds/deployment/tracking.
- Decisions: Port approved layout, immediate fields, dirty-only footer and surfaces; retain real client/auth/version/conflict/uncertain handling and launcher lifecycle. Do not import samples/mock boot/global styles. Ship compatible web backend, not frontend alone. No workers/collectors/env/schema changes or pending046 application.
- Checks and evidence: Planning only. Railway describe-service confirms current web SUCCESS, configured domains and no staged patch. Existing preparer follows reachable imports and built assets. Required checks cover synthetic browser-to-API behavior, builds, package contents and real authenticated hosted reads/exact asset/visual readback.
- Resulting state / acceptance: Plan accepted; implementation/testing assigned. Live mutation and new model calls unnecessary.
- Remaining work and handoff: Implement, independently test/review, package/deploy web, verify and integrate records.
