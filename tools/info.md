# Model-callable tools

Each folder defines the names, JSON arguments and execution functions that the
assistant model can select. Tools call server clients, services or saved-data
stores directly. They do not call this application's HTTP routes. HTTP routes
and tools often share the same service; `POST /api/tools/:tool` calls selected
tools, rather than tools calling that route.

| Folder         | Responsibility                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `discord/`     | Read permitted live Discord content and produce bounded summaries; conversation-local drafts do not send messages.     |
| `google/`      | Read Gmail and Drive through the configured Google client.                                                             |
| `calendar/`    | Read and change the fixed Calendar target with source and version checks.                                              |
| `miro/`        | Read permitted boards through official Miro MCP.                                                                       |
| `attio/`       | Read CRM records and perform explicitly allowed writes with read-before-update protection.                             |
| `map/`         | Read saved map events, resolve people and apply validated complete activity snapshots.                                 |
| `contacts/`    | Search/read/create/edit/delete saved Contacts, and separately import native Treg result references.                    |
| `treg/`        | Search people and enrich actual email addresses; retain bounded native results privately for a separate Contacts save. |
| `gmail-send/`  | Website-only sending with stable operation identities, durable receipts and uncertain-outcome protection.              |
| `memory/`      | Read and version-check updates to the shared club note.                                                                |
| `bug-reports/` | Save a structured current-conversation bug report.                                                                     |

`server/runtime/services.js` assembles the configured chat services. The chat
runner executes tools with request-specific context; the autonomous worker builds
its own adapters under `server/automation`. Those adapters also expose queue/task
controls, which are in-process operations rather than separate HTTP endpoints.

Some tools mostly translate and validate arguments. Others retain exact-read
receipts, deduplicate requests, preserve native data, or protect uncertain writes.
A tool description or registration never grants broader source permissions.

Ordinary tools touch only their named service or saved data. Multi-service
workflows are selected in agent prompts. The explicitly authorized
`sync_calendars_to_map` operation remains separately named, dispatched and logged.
Source reads, Calendar writes and map writes otherwise stay separate.

See [tools and HTTP APIs](../docs/tools-and-api.md),
[API endpoint inventory](../src/api/info.md), and the
[rolling milestone](../milestones/milestone.md) for current implementation state.
