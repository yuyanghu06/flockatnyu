# Chat tool limits verified

- Local timestamp / acting role / milestone: 2026-10-21T12:38:34.407832-04:00 / orchestrator / chat limits explanation.
- Requested scope: identify maximum tool-call turns for Discord and website chat.
- Starting repository state: existing uncommitted October21 diagnostic journal changes preserved.
- Work performed / changed files: inspected shared runner, website route, Discord runtime/bridge references and assistant context loop; updated journal only.
- Decisions: both chat transports share the same ceiling: eight planning rounds, eight executed tool calls total, at most two executions per round. Final answer generation follows separately. Automatic initial memory read is outside the model-selected call counter. Timeouts, no-progress and context guards can stop earlier.
- Checks and evidence: static source inspection of server/assistant-context.js:18,374,431,473-474; server/chat-runner.js; server/app.js; server/runtime-app.js and server/discord/chat-bridge.js references. No runtime tests or live deployment recheck performed for this source explanation.
- Resulting state / acceptance: current checked-in runtime limits established; application code/configuration unchanged.
- Remaining work and handoff: no limit change requested; retain existing collector recovery follow-up.
