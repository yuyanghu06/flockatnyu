# Hosted Discord migration review

- Local timestamp / acting role / milestone: 2026-10-11T16:03:46.315350-04:00 / planner (focused evaluation) / M17.
- Requested scope: independent read-only review before authorized hosted schema preparation.
- Starting state: confirmed Tech NYU target jssehnrmqhstcrtxulpa; orchestrator observed empty public schema/migration history and no vector extension. New Railway tech-nyu project and discord-archive service created using authenticated CLI after stale MCP mutation authentication failed.
- Work performed / changed files: specialist inspected both complete migrations and SQL tests; no edits/writes.
- Decisions: accepted 001 then 002, once each through tracked transactional migration tool. Do not run runtime between them, because extensions USAGE is granted in 002. Tables/RPCs are service-only; no automatic reader/admin grants.
- Checks and evidence: independent node --test tests/discord-sql.test.mjs passed 9/9 actual isolated PostgreSQL/pgvector/ACL/rollback/checkpoint tests. All 12 tables enable/force RLS, browser/public grants revoked; invoker RPCs empty search_path; service role gets DML, RPC, extension and revision-sequence privileges.
- Resulting state / acceptance: accepted for hosted application; actual hosted installation, roles/catalog and PostgREST remain to be observed. No specialist external writes. CLI service ID 2dad5e78-ff4f-4342-acc3-bf3daba2f3f3, environment dfe169c1-46a0-415a-9171-309fc9974ef8.
- Remaining work and handoff: orchestrator apply/verify both migrations, inspect vector placement/RLS/grants/invoker RPC and empty sync channels; credential-dependent PostgREST and live Discord await setup.
