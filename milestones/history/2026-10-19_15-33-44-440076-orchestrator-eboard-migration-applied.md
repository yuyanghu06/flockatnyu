# Discord discovery migration applied and read back through owner dashboard

- Local timestamp / acting role / milestone: 2026-10-19T15:33:44.440076-04:00 / orchestrator / eboard-discovery-availability.
- Requested scope: resume the authorized live repair after user restored Supabase project-owner access. Git push remains cancelled.
- Starting repository state: accepted035 unchanged; authorized dashboard preflight matched017/020function bodies; legacy archives discovery had0readable channels.
- Work performed / changed files: prepared reviewed SQL in normal dashboard SQL editor, checked entire editor via UI clipboard comparison and verified its SHA256 through a read-only SQL query. Applied035 and migration receipt20261019193035 in one transaction. No source content, credential extraction, new permissions, service redeploy or restart.
- Decisions: retained original transaction, locking and SQL byte-for-byte; added only an atomic schema_migrations receipt containing the original SQL. Legacy incomplete discovery remains closed until normal completion; do not manufacture publication proof.
- Checks and evidence: receipt source SHA2569c9030505f71a8fcc1c7e5ec0371abd92c18beb4e1852ec32823856e80c59455. All four function-body MD5s match tested source; SECURITY INVOKER and postgres/service_role-only EXECUTE confirmed. Policy scope hash9cfa49799cf784d97a5f4c9e614ee3f4 and source/manual identity hash7c512c987d5aab703f5b60a2c9c78420 unchanged. Collector advanced from task48to89of191; staging273/publishednull/readable0 is the intended legacy upgrade state.
- Resulting state / acceptance: schema repair is applied and verified; live base-channel recovery remains pending current scan completion. No end-to-end Discord reply or uninterrupted-refresh canary claimed yet.
- Remaining work and handoff: observe scan completion, verify base channels and exclusion boundaries, then run a bounded rollback-only partial-refresh canary. Keep source uncommitted/unpushed per user cancellation.
