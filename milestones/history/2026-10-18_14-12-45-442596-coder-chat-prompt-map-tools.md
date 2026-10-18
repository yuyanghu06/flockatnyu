# Chat prompts and request-local map tool wiring

- Local timestamp / acting role / milestone: 2026-10-18T14:12:45.442596-04:00 / coder / agent-prompts.
- Requested scope: implement and independently verify user-defined chat and autonomous planner behavior.
- Starting repository state: planner contract and existing uncommitted work; concurrent files preserved by exclusive ownership.
- Work performed / changed files: server/assistant-context.js, server/app.js, server/index.js, tools/map/chat.js, docs/chat-agent-prompt.md, tests/chat-agent-policy.test.mjs.
- Decisions: Calm friendly tone; eboard aggregate first/general fallback/team explicit only; Calendar-first/Miro fallback; request-local source-backed map updates and exact identity checks; successful applied receipts;8calls/8rounds bound. Stateless map writes and team reads denied.
- Checks and evidence: 73/73 focused chat/context/Calendar/map/stream/Miro/memory checks; syntax and whitespace pass.
- Resulting state / acceptance: assigned pass accepted from actual files and reported commands; final integration review remains.
- Remaining work and handoff: parent owns shared guides/journal, broader regression/build checks and final independent evaluation. No worker activation, deployment or real-model/event-write pilot claimed.
