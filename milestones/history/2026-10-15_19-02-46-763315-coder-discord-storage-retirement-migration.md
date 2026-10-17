# discord storage retirement migration

- Local timestamp / acting role / milestone: 2026-10-15_19-02-46-763315 / coder / M28.
- Requested scope: Apply the user-approved14table cleanup and Miro27to12column simplification.
- Starting repository state: Read-only assessment complete; live-first workers and Miro infrastructure exist; dirty workspace preserved.
- Work performed / changed files: Migration013 explicitly retires14empty tables and42obsolete functions; rewrites retained configuration/cutover/status and guards. Temporary actual001–013 fixture checks passed preservation, nonempty rollback, retired writes, ACLs and discovery. Hosted application remains pending. Files: supabase/migrations/202610150013_retire_obsolete_storage.sql.
- Decisions: Preserve all retained data, permissions, provenance and usage receipts; immutable001–012; noCASCADE.
- Checks and evidence: Cited local checks above; independent tracked preservation suite tests/schema-cleanup-sql.test.mjs.
- Resulting state / acceptance: Local SQL accepted; runtime retirement/testing and hosted migration/deployment remain pending.
- Remaining work and handoff: Finish network-free oldCLI/store retirement, independent regressions/review, apply013/014 and verify hosted preservation/configuration.
