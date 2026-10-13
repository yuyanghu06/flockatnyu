# M20 execution RPC budgets — independent tester PASS

- **Milestone / role / scope:** bounded 010 migration/storage-adapter acceptance. Owned only `tests/discord-summary-execution-budget.test.mjs` and `evidence/execution-budget-*`. No implementation, shared journals/docs, external SQL, credentials, models, cloud or child agents.
- **Starting state / inspected files:** parent acceptance criteria and report template, current milestone/to-do state, summary-store public methods, exact006–009 function definitions and coder's stable010 signature/settings contract.
- **Work performed:** new independent tests cover 15 public store methods, timeout/cancellation/failure paths and genuine isolated PostgreSQL application of all ten migrations. Previous tests/scale evidence remain preserved; no large archive fixture was repeated.
- **Decisions / assumptions:** deadline changes must not change any RPC body, status mapping, retry count, cancellation semantics, body/ACL or financial guard. Local mocked signals test expiry immediately; local catalogue checks establish configuration scope, not actual hosted contention latency.

## Executed checks

| Command | Result |
| --- | --- |
| `node --test tests/discord-summary-execution-budget.test.mjs` | Exit 0; **4/4 scenario groups**, 5.08s. `execution-budget-tests.log`. |
| `node --test tests/discord-store.test.mjs tests/discord-summary-schedule.test.mjs` | Exit 0; **13/13**, 406.5ms. `execution-budget-existing-checks.log`. |
| `npm run build:api` | Exit 0; API syntax/runtime dependencies verified. `execution-budget-api-build.log`. |
| `git diff --check` | Exit 0. |
| SHA256 checks | `execution-budget-hashes.log`; migration010 `5e65ff3325471c8d63f956c977fcb8e8a1b14e63e09296a6edfaea354b3375d8`, store `f3573a19405886a6b56bb377ff2d74118b0cb705ea49200318d22dfa55619854`. |

## Independently verified behavior

- All 15 successful wrapper methods retain their exact named JSON request arguments, URL/method/redirect behavior and public status/interface. Eight execution methods now receive 60000ms: claim, renew, input/part retrieval, save part, reserve, usage commit and failure recording. Prepare remains 60000ms; preview/begin/finish remain 65000ms; operation/pending/result metadata remain 12000ms.
- Every method rejects a pre-aborted caller with 0 fetches/0 created deadlines. Thirty parent/deadline cancellation paths make one request each, cancel the combined signal promptly, preserve the original caller's state and return sanitized aborted/unavailable status without wall-clock waits.
- Seventy-five simulated SQL57014, 503, 403, 40001 and network-error paths make exactly one HTTP attempt each. Timeout/network failures do not gain retries or leak exception text; existing permission/conflict mappings remain unchanged.
- A genuine PGlite database applies 001–009, snapshots the complete public function metadata/definitions/ACLs, tables/indexes/sequences, policies, roles and global statement/lock/work_mem settings, then applies 010.
- Exactly nine functions gain statement 55s and lock 55s: `claim_job`, `renew_job`, `get_inputs`, `get_parts`, `save_part`, `reserve_request`, `commit_usage`, `fail_job`, and internal `lock_job`. `finish_job` gains only lock 55s; its statement 60s and 16MB work_mem remain intact. Prepare/planning and every untargeted function configuration stay identical.
- Complete function bodies/signatures/ownership/volatility/security/ACLs are identical before/after. Full generated definitions also match after excluding only the allowed timeout attribute lines. Altered functions remain invoker, browser-execute denied and service-execute permitted. No RLS/policy/table/role/global GUC changes occur.
- Migration text contains no role/database/system/session change or function-body replacement. All nine prior file hashes remain unchanged across application;006–009 additionally match prior pinned acceptance hashes. All ten migration hashes and scoped catalogue proof are recorded in `execution-budget-catalogue.json`.

## Findings / limitations / handoff

No source finding. A test-only array equality check was corrected to deep comparison before execution. Older summary SQL adapter expectations for 12s input/part calls were identified to root; tester did not edit those unowned files, and root reported its two updated legacy checks passing separately.

**Verdict: PASS for bounded local 010 acceptance.** No actual hosted claims/locks, timing under concurrency, API hoisting, model receipts, production data, deployment or scheduling state were exercised. The local SQL fixture is isolated and has no archive-scale timing claim.

Root owns folder-guide and milestone/history updates. After journaling this pass with evaluator acceptance, root can apply 010 and independently test real concurrent claims/releases under unchanged accounting before resuming model work.
