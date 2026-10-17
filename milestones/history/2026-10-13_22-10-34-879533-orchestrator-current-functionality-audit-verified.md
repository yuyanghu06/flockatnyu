# Current functionality inventory and local verification

- Local timestamp / acting role / milestone: 2026-10-13_22-10-34-879533 / orchestrator / current functionality audit.
- Requested scope: check what functionality is built now.
- Starting repository state: published M22; existing M20 backend and M21 frontend acceptance retained.
- Work performed / changed files: Integrated independent read-only frontend/backend inventories, inspected source and current Git state. Application code unchanged. Updated only milestone journal/guides. Starting HEAD ff38922 on codex/dev with clean tree. Map/sidebar visibility and raw-only chat retrieval are material product limitations, not fixed in this inspection.
- Decisions: distinguish source implementation, historically verified hosted runs and checks rerun today; preserve all application/user changes.
- Checks and evidence: npm run test:assistant: 33/33; npm run test:discord: 270/270; startup 9, WASD 5, camera-focus 21 and map-interactions 16 assertions passed (354 local assertions total). npm run build:api and npm run build passed; Vite reports existing >500 kB chunk warning. Fresh Chrome map-input-browser: 14/14, no uncaught JS errors; API status mocked, no model/backend calls. MAP_URL http://127.0.0.1:4183; temporary evidence /tmp/techvisualized-functionality-audit-20261013/. Preview stopped after checks. No physical input/touch or live health verification.
- Resulting state / acceptance: Audit complete; no implementation, deployment, paid call, cloud mutation or publication. Next product work: auth, summary retrieval, integrations/activity UI; observe summary cron and refresh stale guides.
- Remaining work and handoff: unresolved product tasks preserved in to-do; root serializes all journal writes.
