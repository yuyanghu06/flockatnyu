# Callable assistant tools

Existing tool schemas, argument validation and execution adapters live here by capability. Source API clients, policy enforcement and ingestion remain under server/. server/index.js constructs the trusted read-tool set for chat. The automation handler accepts an explicitly supplied set; its finish_batch control stays in server/automation/. Collectors do not load this directory.

- discord/index.js: live Discord read definitions, validation and dispatch.
- discord/live-summary.js: bounded request-memory summarization wrapper for live reads.
- google/index.js: Gmail and Drive read tools using an injected source client.
- miro/index.js: board/frame/item/relationship read tools.
- map/index.js: shared normalized event reads, exact linked person lookup and optimistic one-event upsert; automation binds writes to current-batch supporting source evidence.
- calendar/index.js: fixed-target Calendar reads and managed Miro event upsert/cancellation for the update agent.

Tools preserve existing source restrictions; adding a directory never grants a service access. Calendar writes require the update agent’s fixed target, trusted source scope and current-batch Miro evidence. Map tools use the shared current-source authorizer; registration grants no broader source scope. update_memory remains future work. Development, deployment and asset utilities are in ../scripts/.

- bug-reports/index.js: dedicated chat bug_reports write tool with trusted current-message/request context and structured JSON; no report listing, editing or deletion.

- memory/index.js: chat read_memory/update_memory tools for one shared plain-text note, with current-chat context and optimistic timestamp protection. Updates are proactive for useful durable club facts; no explicit remember request is needed.
