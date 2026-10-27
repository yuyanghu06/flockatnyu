# Tools and HTTP APIs

The tools are not wrappers around our own HTTP routes. They are a second way to
call shared server services. The assistant model selects a tool with JSON
arguments; a browser sends an HTTP request. Each entry point checks its own
arguments and authorization before reaching the shared implementation.

```text
Assistant model → tool → server service/client/store
Browser        → route → server service/client/store
```

For example, the Gmail-send tool and `POST /api/gmail/send` both call the Gmail
sending service. Saved Contacts tools and `/api/contacts` routes share the Contacts
store. Neither tool calls the corresponding HTTP URL.

| Family                 | What the tool calls                        | What it checks or adds                                                                                                                       |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord                | Live Discord retrieval service             | Allowed channels, bounded coverage, safe results; the summary operation can aggregate and summarize permitted evidence.                      |
| Gmail and Drive        | Google client methods                      | Account access, arguments, bounded content and safe failures.                                                                                |
| Calendar               | Fixed-target Calendar client               | Source binding, pagination, exact versions, duplicate protection and confirmed write results.                                                |
| Miro                   | Official Miro MCP client                   | Board access, native arguments, parsing, pagination and fragment coverage.                                                                   |
| Attio                  | Attio client                               | Allowed objects/sources, read-before-update and uncertain-write protection.                                                                  |
| Map                    | Map event service and Supabase store       | Fixed catalogues, source scope, complete snapshots, exact versions and participant preservation.                                             |
| Contacts               | Contacts store                             | Exact reads before edits, native JSON preservation, write receipts and uncertainty fences.                                                   |
| Treg people            | People-search and email-enrichment clients | Paid-call bounds, private raw logging, per-request deduplication and private native-result references. Saving uses a separate Contacts tool. |
| Gmail sending          | Gmail send service                         | Stable operation identities, deduplication and durable receipts.                                                                             |
| Memory and bug reports | Saved-data stores                          | Conversation context, field limits and, for memory, an exact saved version.                                                                  |
| Worker controls        | Queue/task stores and runner state         | Leases, task versions, evidence and completion checks.                                                                                       |

There is no one-to-one match between a tool and a URL. Status, health, chat,
steering, administration and planner-start HTTP interfaces do not each have a
matching model tool. The four dormant Treg lookup endpoints have no model tools.
The generic `POST /api/tools/:tool` endpoint calls selected tool adapters—the
reverse of a tool calling our HTTP API.

The older `/api/contacts/import/treg` endpoint uses an importer that searches and
saves results. The model's people-search/email-enrichment tools and
`import_treg_contacts` are deliberately separate operations. They are different
entry points, not equivalent wrappers.

Source reads, saved-map reads and Calendar writes remain separate operations.
The explicitly named `sync_calendars_to_map` operation is the approved combined
Calendar-to-map workflow. This audit explains existing behavior; it does not add
new operations or change permissions.

The [endpoint inventory](../src/api/info.md), [tool folders](../tools/info.md),
and [server guide](../server/info.md) identify the implementations and boundaries.
