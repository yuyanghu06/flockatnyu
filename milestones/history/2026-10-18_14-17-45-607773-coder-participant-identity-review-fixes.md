# Source-bound participation and review fixes

- Local timestamp / acting role / milestone: 2026-10-18T14:17:45.607773-04:00 / coder / agent-prompts.
- Requested scope: independent prompt/tool review and focused fixes within user-authorized agent behavior.
- Starting repository state: implemented local chat/update source routing and map evidence gates; extensive existing work preserved.
- Work performed / changed files: review/fix of server/discord/channel-scope.js, tools/map/chat.js, server/google/mailbox.js, server/assistant-context.js, server/automation/adapters.js/prompt.js and related focused tests/docs. Evaluator passes read-only.
- Decisions: exact provider/occurrence identities and original evidence are separate from source read permission; negative user requests cannot authorize teams.
- Checks and evidence: 73/73focused update/Calendar/map/mailbox tests and whitespace pass. Exact original author/sender plus successful per-source UUID receipt now required for changed participants; unchanged relationships retained. Parent added conservative team exclusions, exact Calendar ID binding, shared single-mailbox parser, prompt wording correction, and corrected stream metadata/historical fixture tests.
- Resulting state / acceptance: Implemented and regressed; final evaluator rerun.
- Remaining work and handoff: parent finishes broader tests/builds, completed metadata refresh/live read-only policy checks, final guides and requested configured-model cases. No live Calendar/map event mutations or activation/deployment claimed.
