# Explicit batch regressions verified

- Local timestamp / acting role / milestone: 2026-10-19_18-34-28-999920 / tester / explicit action completion.
- Requested scope: finish clear user-directed source-to-Calendar batches without redundant permission loops.
- Starting state: diagnosis contract accepted; source initially at 557eb5d.
- Work performed / decisions / evidence: Independent seven-file suite passed 100 checks with synthetic production-provider/Google/Calendar HTTP: more than eight rows, exact all-day ends, 50-row maximum, past/leap dates, matching existing rows, repeated rows, permission/schema denial, complete/cyclic pagination, partial failures, fatal access loss, cancellation and retry reconciliation. Native source-copy sees rows beyond 1800 characters and completes per-item receipts. Catalogue tests reflect six Calendar and 27 total tools; concise prompt policy assertions retain user/source boundaries. One additional total-page-cap assertion is being added before final freeze.
- Resulting state: local implementation accepted within stated test evidence; final parent model/regression/release acceptance pending.
- Remaining work: collect actual configured-model cases, final checks/builds, guarded deployment and hosted read-only verification. No business-source writes or Discord posts during this pass.
