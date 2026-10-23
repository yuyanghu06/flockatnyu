# local source bindings and sync retries fixed

- Local timestamp / role / milestone: 2026-10-23T15:47:38.705408-04:00 / coder / isolated tools implementation and common workflows.
- Scope: user-authorized fixes, separate automatic sync exception and freshlocal prompt-driven common-task checks.
- Work and evidence: Map source-binding correction is frozen: exact DB-owned Discord source/guild/channel bindings; Miro enabled/team/source authorization metadata read through Supabase only and reused locally for DB writes;144focused checks/API pass. Parent23Discord-scope checks pass. Worker cross-cycle sync identity now combines private cycle UUID and Calendar mutation version, and exact already-absent/already-cancelled Calendar receipts can resolve matching tasks locally.15worker and29sync checks pass.
- Result/limits: all business services simulated for tests; actual inference onlyconfiguredendpoint. Source frozen between model batches; no source/schema/business writes or deployment.
- Next: close corrected actualmodel gates with stablepins, independent semanticreview, finalintegration.
