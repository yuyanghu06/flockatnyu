# Building activity verification

This folder contains aggregate hosted migration024 evidence and synthetic browser
checks for the base building focus card and capped avatar layout. Real roster or
event contents and credentials do not belong here.

- migration-receipt.json records hosted version20261018000104, nine empty defaults
  and transaction assertions preserving existing rows, functions and ACL/RLS.
- hosted-verification.json records exact local/hosted receipt equality, JSONB
  NOT NULL default and denied browser/catalogue writes.
- report.json and synthetic screenshots record the final production-preview
  browser run. The initial two-section card was removed by a concurrent parallel
  conversation events-only revision, which the final run preserves.

The direct SQL/API tests passed23checks; prior022/023regressions passed21checks.
Both frontend/API builds passed. Final browser run passed5checks with0pageerrors; desktop,tall and mobile synthetic screenshots were inspected. Headless software WebGL and viewport emulation
are not physical-device performance evidence. No independent agent was used in
this side conversation. Event arrays are empty after migration; ingestion and
runtime source-policy wiring remain separate work.

Bobst debug receipt records4user-authorized fictional hosted event fixtures and live local API presentation. It includes no real event/attendee records. Standardized schema and owner-only write boundary remain unchanged.

attendee-migration-receipt.json records hosted025body equality, unchanged grants and aggregate sample attendee counts; names/UUIDs and actual portrait screenshots stay private under /tmp.
