# Independent review requested fixes

- Local timestamp / acting role / milestone: 2026-10-18T14:17:45.607772-04:00 / evaluator / agent-prompts.
- Requested scope: independent prompt/tool review and focused fixes within user-authorized agent behavior.
- Starting repository state: implemented local chat/update source routing and map evidence gates; extensive existing work preserved.
- Work performed / changed files: review/fix of server/discord/channel-scope.js, tools/map/chat.js, server/google/mailbox.js, server/assistant-context.js, server/automation/adapters.js/prompt.js and related focused tests/docs. Evaluator passes read-only.
- Decisions: exact provider/occurrence identities and original evidence are separate from source read permission; negative user requests cannot authorize teams.
- Checks and evidence: 62/62focused checks passed, but independent in-memory reproductions found5material contract gaps: autonomous participant identity unbound; except/excluding team opt-outs; Gmail display text identity spoof; chat Calendar occurrence identity drift; contradictory Calendar provenance instruction.
- Resulting state / acceptance: REQUEST FIXES; findings assigned to coder/parent. No external or source writes.
- Remaining work and handoff: parent finishes broader tests/builds, completed metadata refresh/live read-only policy checks, final guides and requested configured-model cases. No live Calendar/map event mutations or activation/deployment claimed.
