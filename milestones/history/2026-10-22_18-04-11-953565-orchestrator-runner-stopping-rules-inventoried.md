# Runner stopping rules inventoried

- Local timestamp / acting role / milestone: 2026-10-22T18:04:11.953565-04:00 / orchestrator / update-agent explanation.
- Requested scope: General inventory of runner blockers beyond Discord reads, without changing code.
- Starting state: Prior task-timeout/read-failure diagnosis retained; user has not resumed implementation.
- Work performed / changed files: Read full automation handler and configuration/provider boundaries; journal only.
- Decisions: Distinguish ordinary disabled/busy/empty/wait/cooldown exits from failed attempts. Failed-run checks include malformed queue claims, source authorization, lease loss, preparation/cache/API/checkpoint failures, invalid or unsupported model replies, unknown/phase-invalid tools, schema/call/input-ID errors, invalid finish calls, tool exceptions/nonaccepted results/null/size overflow, conversation/history limits, model/provider failures and configured deadlines/budgets. Most tool failures are rejected before model feedback; read-only invalid_request is a specific exception. Final-phase tool_failed/incomplete_batch/call_limit may settle confirmed initial handling; invalid calls, permissions, global cancellation and context failures do not use that salvage path. Earlier external writes are not rolled back. Underlying tools have additional source/identity/data checks beyond this runner inventory.
- Checks and evidence: Full source inspection of handler.js and config.js, plus provider grep; no new tests required or claimed. Prior55synthetic Discord/automation checks remain cited from the previous pass.
- Resulting state / acceptance: Explanation complete; no application/runtime/configuration/schema/deployment changes.
- Remaining work and handoff: Await user resumption before implementing revised failure handling. Preserve the distinction between safe per-tool continuation and losing the whole run's lease or deadline.
