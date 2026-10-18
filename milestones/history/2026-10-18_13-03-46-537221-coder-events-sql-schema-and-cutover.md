# Normalized event SQL and gated cutover

- Local timestamp / acting role / milestone: 2026-10-18T13:03:46.537221-04:00 / coder events_sql / events-relationships.
- Requested scope: normalized tables, deterministic additive legacy conversion and verified cleanup.
- Starting repository state: migrations001–025 already applied; concurrent UI changes preserved.
- Work performed / changed files:026events_relationships,027events_cutover,events-relationships-sql.test.mjs and migration info guide.
- Decisions: RPC-only service writes through postgres-owned SECURITY DEFINER functions with empty search_path; FORCE RLS/browser denial; fixed catalogue; explicit bounded all-record snapshot for reconciliation; full-snapshot compare-and-swap writes. Legacy source timestamps absent, so start is a documented reported_at proxy; no TTL reset. No primary/per-person building and no cross-event moves.
- Checks and evidence: coder executed node --test tests/events-relationships-sql.test.mjs tests/map-events-sql.test.mjs;18/18 passed. Root inspected actual SQL and test files. Real PGlite covers preservation, cross-building deduplication, DST dates, CAS racing writes, strict references, rollback, grants, snapshot saturation and rejected/successful cutovers. git diff --check passed in coder pass.
- Resulting state / acceptance: implementation ready for independent evaluator; no hosted writes yet.
- Remaining work and handoff: runtime/tools integration, independent review, hosted026semantic comparison before027destructive cutover and browser evidence. No monotonic reported_at constraint: legacy future-event proxy is not an authoritative source revision time.
