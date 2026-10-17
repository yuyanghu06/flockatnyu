# shared access final regressions

- Local timestamp / acting role / milestone: 2026-10-15_19-16-17-894224 / tester / M28.
- Requested scope: Finish approved cleanup, policy rename and shared access without per-person membership tables.
- Starting repository state: Reviewed001–016 implemented/applied; final cloud verification and image builds in progress; unrelated dirty changes preserved.
- Work performed / changed files: Independent final shared-access acceptance passed 54/54 tests, including no-ID service reads, backend admin denial, configured source scope, policy exclusions and 19-table retention. Evidence: shared-access-report.md and shared-access-tests.log.
- Decisions: Keep source allowlists, active source/policy state, backend admin checks, service-only SQL and existing lease/accounting boundaries. Applied migrations remain immutable.
- Checks and evidence: evidence/m28-schema-cleanup/ contains hosted inventories, exact fingerprints, ACL catalogue, migration receipts, no-member RPC smoke, successful image receipts, context hashes and passing test logs.
- Resulting state / acceptance: M28 complete after independent local and hosted-evidence acceptance. 19 tables remain.
- Remaining work and handoff: Miro token/board scope still missing, so sync remains disabled. Initial Discord catchup last had351pending jobs after a partial rate-limited invocation; current809summaries have ready vectors with0missing. Final-image future cron invocation remains unobserved. No frontend authentication redesign or public frontend deployment in this pass.
