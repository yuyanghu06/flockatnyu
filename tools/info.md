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

- `attio/index.js`: live CRM attribute discovery, fuzzy search, record reads and opt-in create/PATCH tools. Chat uses request-bound read-before-update and duplicate-write protection. Direct authenticated tool routes represent explicit API actions. Source UUID/object allowlists are enforced before provider access; no autonomous-worker registration.


October23 isolation: each ordinary tool reads/changes its named service or saved
store. Map tools are DB-only, Calendar/Member Plans tools are Calendar-only,
source/member/map workflows are prompt-selected, and task completion is local
proof plus exact saved-version deletion. sync_calendars_to_map is the explicitly
user-authorized combined operation, separately dispatched/logged after successful
initial finish_batch. See docs/tool-isolation-implementation.md and the current
rolling milestone for implementation and verification state.

- `contacts/index.js`: separate saved-contact search, exact read, create, update
  and delete tools for website/Discord chat. Writable fields are first_name,
  last_name, email, phone_number, workplace and notes. Omitted edit values and
  legacy JSON remain intact; an empty string clears an explicitly named field.
  Request-local exact reads and timestamps protect updates/deletes. Tool results
  and receipts feed model context, while contact values stay out of content-free
  execution metadata. These tools are separate from Attio and are not registered
  with the autonomous update agent.

`treg/index.js` provides separate Treg people search and array-email enrichment for shared website/Discord chat. Both perform lookups only, reuse results within a request, and return only supported contact strings and bounded safe outcomes. They never import Contacts or read sender cache; raw full-call logs stay private.

`gmail-send/` contains a separate website-only send tool with stable request-group identities and durable receipts. It performs no recipient lookup or source reads; those remain separate named tools.
