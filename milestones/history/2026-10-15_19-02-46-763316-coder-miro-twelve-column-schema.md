# miro twelve column schema

- Local timestamp / acting role / milestone: 2026-10-15_19-02-46-763316 / coder / M28.
- Requested scope: Apply the user-approved14table cleanup and Miro27to12column simplification.
- Starting repository state: Read-only assessment complete; live-first workers and Miro infrastructure exist; dirty workspace preserved.
- Work performed / changed files: Migration014 renames snapshot to data and removes15columns while preserving raw JSON, source authorization and leases. Existing deployed worker signatures and pre-migration lease remain valid. Miro25/25 and targeted actualSQL fixtures passed. Files: supabase/migrations/202610150014_simplify_miro_boards.sql, server/miro/store.js, server/miro/info.md.
- Decisions: Preserve all retained data, permissions, provenance and usage receipts; immutable001–012; noCASCADE.
- Checks and evidence: Cited local checks above; independent tracked preservation suite tests/schema-cleanup-sql.test.mjs.
- Resulting state / acceptance: Local SQL accepted; runtime retirement/testing and hosted migration/deployment remain pending.
- Remaining work and handoff: Finish network-free oldCLI/store retirement, independent regressions/review, apply013/014 and verify hosted preservation/configuration.
