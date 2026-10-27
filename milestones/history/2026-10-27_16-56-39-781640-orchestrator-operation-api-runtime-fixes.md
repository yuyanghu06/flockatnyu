# Corrected operation rejection and write-result handling

- Local timestamp / acting role / milestone: 2026-10-27T16:56:39.781640-04:00 / orchestrator / tool-operation-api-live-2026-10-27.
- Requested scope: resume runtime/live tests of the new tools → private API → services structure.
- Starting repository state: Branch 02427ba with original unrelated local documentation preserved. No application source edits were pending before this task.
- Work performed / changed files: Changed server/operation-api/session.js and adapter.js to retain the parent/full catalogue for request-specific sessions; Attio factory supplies its full catalogue despite write filtering. Unknown names reject as invalid_request, while known hidden operations and empty/closed sessions stay forbidden. dispatch.js separates service exceptions from response serialization failures, returning read invalid response or write_outcome_unknown without replay. Tester corrected only incidental function-identity comparison in tests/chat-calendar-write.test.mjs.
- Decisions: No domain authorization, source scope, lease/version checks, budgets, workflow sequencing or provider write policy changed. No deployment, commit, push or live business write.
- Checks and evidence: Focused parent run63/63 passed before independent final reruns. Original service error identity and one-dispatch write uncertainty are specifically checked. Independent final evidence follows.
- Resulting state / acceptance: This pass is recorded separately from any production deployment. See the rolling snapshot for current acceptance and unresolved findings.
- Remaining work and handoff: finish configured-model/live-provider review, standard static/build gates, documentation and independent final evaluation. Preserve unrelated local notes and prior journal additions.
