# Discord read failure handling traced

- Local timestamp / acting role / milestone: 2026-10-22T18:02:38.949214-04:00 / orchestrator / update-agent diagnosis.
- Requested scope: Check whether exact Discord message reads already handle failures and let the model continue. No implementation requested.
- Starting state: Existing source/task incident diagnosis and concurrent work preserved.
- Work performed / changed files: Read Discord paced transport/live retrieval/tool wrapper and update-agent adapter/handler. Journal only.
- Decisions: Discord transport maps404/403/provider failures; retrieval catches these into status plus empty sources and incomplete coverage. The update handler rejects most such read statuses before appending a model-visible tool result, so the model cannot handle them and move on. Literal null would also fail the handler object check. The distinction is failed read versus successful empty content; the model should receive an explicit outcome when continuation is supported. No new tool or bundled reference validation is needed for this conclusion.
- Checks and evidence: node --test tests/discord-live-tools.test.mjs tests/agent-automation.test.mjs passed; /tmp/discord-read-failure-check.log. No source/model/network calls, runtime edits or deployment. Coverage is existing synthetic tests plus source tracing; no claim of new live behavior.
- Resulting state / acceptance: Read-only explanation complete; actual behavior unchanged.
- Remaining work and handoff: User has not resumed code changes. Future runner correction should return safe read failures to the model without erasing failure status or inventing content; preserve global cancellation and unfinished work.
