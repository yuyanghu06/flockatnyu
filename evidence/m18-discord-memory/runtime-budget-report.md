# Agent pass report: M18 scoped classification runtime budget

- Milestone / role / scope: M18 / independent tester / migration 005 settings,
  store timeouts, cancellation, unchanged local classification semantics. Hosted
  runtime execution belongs to the orchestrator; tester performs read-only SQL.
- Starting state: local 004 performance passed, but root reproduced actual
  runtime RPC 57014 at about nine seconds. Root separately published all grouped
  originals through MCP; independent hosted storage verification passed.
- Changed files: `tests/discord-memory.test.mjs`, `tests/discord-store.test.mjs`
  and assigned evidence only. The memory fixtures apply all five migrations.
- Decisions: preserve the original 15-second local rebuild budget and unchanged
  108,828-original / 216-eligible-source skew fixture. Native timeout signals are
  replaced with controllable abort signals in one test, allowing reproducible
  timeout/caller-cancellation checks without waiting 65 seconds.
- Executed checks:
  - `node --test tests/discord-memory.test.mjs tests/discord-store.test.mjs > evidence/m18-discord-memory/runtime-budget-tests.log`
    exited **1**, 24 passed and one fixture assertion failed: an empty search
    correctly returns `empty`, while the initial test expected `ready`.
  - After correcting only that fixture,
    `node --test tests/discord-store.test.mjs > evidence/m18-discord-memory/runtime-store-tests.log`
    exited **0**, **6/6** passed.
  - `node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs > evidence/m18-discord-memory/runtime-integrated-tests.log`
    exited **0**, **136/136** passed, zero failures/skips. Representative rebuild
    timings **1,906.6 ms / 2,141.0 ms**, 3,139 fixture groups.
  - `npm run build:api > evidence/m18-discord-memory/runtime-api-build.log`
    exited **0**, API syntax/runtime dependencies verified.
- Verified behavior: migration 005 preserves the rebuild body/ACL/invoker status,
  all other application function settings and role settings. Only rebuild gets
  `statement_timeout=60s` / `work_mem=16MB`. Session settings remain unchanged
  after successful and stale-revision rebuild calls. All original membership,
  scope, temporal boundary, idempotence and reset/permission checks still pass.
  Store allocates 65 seconds only to classification; ordinary sync/search calls
  retain 12 seconds. Caller cancellation and simulated timer cancellation abort
  the actual fetch signal and return sanitized statuses. An already-aborted
  caller makes no request or new timeout allocation.
- Findings / limitations: fixture correction above is not an application defect.
  Local tests do not verify PostgREST timeout hoisting or hosted execution latency.
  Actual runtime API success and Railway deployment/scheduling are separate checks.
- Acceptance verdict: **PASS** for local five-migration/store behavior. Root later
  reported actual updated-store/PostgREST classification ready / exit 0 in
  43,218 ms. Tester independently verified final hosted function settings/body,
  invoker ACL and unchanged grants in `live-storage-report.md`; the actual runtime
  API call belongs to root's evidence. Railway schedule remains a separate check.
- Folder-guide updates needed: orchestrator owns evidence guide and milestone log.
- Handoff: orchestrator can accept the local and hosted storage passes and record
  them with its actual runtime/deployment results. No scheduled-worker health is
  inferred from these local checks.
