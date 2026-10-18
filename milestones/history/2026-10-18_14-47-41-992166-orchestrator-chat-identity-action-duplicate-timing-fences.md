# Chat action, identity, duplicate and timing fixes

- Local timestamp / acting role / milestone: 2026-10-18T14:47:41.992166-04:00 / orchestrator / agent-prompts.
- Requested scope: implement and test the user's chat/autonomous planner behavior.
- Starting repository state: shared dirty checkout with unrelated authorized map/Miro work preserved; initial local review accepted but real-model findings remained.
- Work performed / changed files: server/assistant-context.js, server/map/chat-intent.js, tools/map/chat.js, tests/chat-agent-policy.test.mjs, tests/discord-agent-policy.test.mjs, server/google/mailbox.js and focused regressions.
- Decisions: Personal map requests bind to an exact user-supplied original reference and linked source author. Negated map requests cannot mutate. Applied single-source receipts stop additional writes; renamed duplicate Discord creations are blocked. New current presence must be timed. The model is told to anchor current self-reports to original message timestamp, with the approved two-hour missing-end default. Unknown future-plan times stay unknown. Team permission requires an affirmative current-user read request.
- Checks and evidence: 56 focused chat/Discord/mailbox checks passed in this pass. Earlier actual-model focused run had exactly one write per supported map request but incorrectly unknown presence time; new timing guidance/guard now awaits actual-model verification. Unsupported self assertions passed twice with zero writes.
- Resulting state / acceptance: local fixes implemented; final model acceptance remains pending. No worker activation, deployment or real Calendar/map event writes.
- Remaining work and handoff: complete configured-model reruns, full regression/build checks and independent final review; record exact limits.
