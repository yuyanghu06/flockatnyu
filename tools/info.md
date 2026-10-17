# Callable assistant tools

Existing tool schemas, argument validation and execution adapters live here by capability. Source API clients, policy enforcement and ingestion remain under server/. server/index.js constructs the trusted read-tool set for chat. The automation handler accepts an explicitly supplied set; its finish_batch control stays in server/automation/. Collectors do not load this directory.

- discord/index.js: live Discord read definitions, validation and dispatch.
- discord/live-summary.js: bounded request-memory summarization wrapper for live reads.
- google/index.js: Gmail and Drive read tools using an injected source client.
- miro/index.js: board/frame/item/relationship read tools.

Tools preserve existing source restrictions; adding a directory never grants a service access. Calendar/map writes and update_memory are future work. Development, deployment and asset utilities are in ../scripts/.
