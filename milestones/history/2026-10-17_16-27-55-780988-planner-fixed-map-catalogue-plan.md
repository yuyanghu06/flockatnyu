# Fixed map catalogue plan

- Local timestamp / acting role / milestone: 2026-10-17T16:27:55.780988-04:00; planner; map-building-write-scope.
- Requested scope: keep building locations fixed; application/tool writes may change only people_here.
- Starting state: applied021 grants broad service CRUD on buildings; no agent map write tools exist.
- Work performed: independent planner reviewed021/invokerRPC/validation trigger/debug CAS script and existingSQL tests; no edits/cloud operations.
- Decisions: add022 revoking service INSERT/DELETE/table UPDATE and grant only column UPDATE(people_here); preserve SELECT/RPC/RLS and server-managed updated_at. Owner catalogue maintenance stays outside runtime tools.
- Checks and evidence: inspection confirms invoker row locks need UPDATE on at least one column; independent realSQLtests must confirm. Applied021 immutable, no new tools/functions/tables needed.
- Resulting state / acceptance: bounded plan accepted; coder and independent tester assigned exclusive files.
- Remaining work and handoff: implement022, meaningful permission/RPC tests, evaluate, apply only new migration and verify hosted effective grants/data preservation.
