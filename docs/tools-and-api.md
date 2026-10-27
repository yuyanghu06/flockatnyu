# Tools, APIs, services and providers

Each model-selected operation now follows this path:

```text
Model → thin tool → private API route → server operation service → provider client/store
```

For example, `read_gmail` posts arguments to the private
`/api/operations/google/gmail/read` handler. That handler invokes
`server/google/operations/google.js`, which checks the existing Google access and
arguments before using the Gmail client. `update_contact` uses
`/api/operations/contacts/records/update`; its Contacts service checks the exact
saved version before changing the database. Saved-data operations end at a store,
rather than an external provider.

The API is a real Hono Request/Response boundary **inside the current process**.
It uses JSON arguments and results, but opens no network port and makes no HTTP
round trip to the public website. Chat and the worker each host their own private
API. These handlers are deliberately absent from the public route registration.
A URL, cookie or header cannot authorize them: a server-created Request must have
an unforgeable binding to its operation and existing private caller context.

There are 54 registered operations. Each has its own `post.js` under
[src/api/operations](../src/api/operations/info.md), grouped by provider or saved
data responsibility and URL. Names and paths are fixed in
[the catalogue](../server/operation-api/catalogue.js). Unknown tool names are not
implicitly registered. Tool descriptions and argument schemas remain the same;
backend services retain their existing validation and permission checks.

| Layer             | Responsibility                                                                                               | Location                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Tool              | Expose a name/schema and call its operation endpoint                                                         | `tools/`                                       |
| API               | Authenticate the private Request, decode arguments, dispatch one named operation and bound the JSON response | `src/api/operations/`, `server/operation-api/` |
| Operation service | Validate domain arguments, access, exact reads, revisions and uncertain writes; retain request state         | `server/<domain>/operations/`                  |
| Provider/store    | Send the actual provider request or read/change saved records                                                | Existing domain clients and stores             |

Principals, source grants, abort signals, leases, raw Treg result caches, receipts
and map read capabilities never come from request JSON. They remain in the
server's private request context. Worker preparation returns JSON arguments plus
a private reference; execution resolves the original prepared object only for
the same caller, scope, exact arguments and active session. Cleanup invalidates
these references. Result serialization cannot turn a private capability into a
model-visible field. Original exceptions stay in a private side channel so the
runner can still stop for lost ownership or required-audit failures without
exposing raw error text.

The transport accepts at most 8 MiB per request or response. This adds no new
model budget, timeout, retry policy or broader service permission. If a write's
response cannot be recovered, it reports an unknown write outcome rather than
claiming failure proves nothing changed.

Trusted lifecycle controls such as creating a request context, advancing user
input, observing a result or refreshing chat time context remain synchronous
server controls. They are not model operations. Worker lease renewal, auditing,
action reservation and stage sequencing remain in the runner. `finish_batch`
checks only completion/bookkeeping; the explicitly authorized
`sync_calendars_to_map` remains a separate named call after successful initial
finish. Other multi-service workflows remain model-selected separate calls.

Existing browser HTTP endpoints remain separate entry points. The compatibility
`POST /api/tools/:tool` endpoint dispatches the same private operation service,
without recursively calling the thin tool. Health, login, chat and administration
routes do not need corresponding model tools. Dormant Treg company/email/phone
lookup routes remain unregistered and have no new tools. The older browser Treg
importer still has its documented search-and-save behavior; model search,
enrichment and Contacts import remain separate operations.

The user resumed runtime/live testing on October 27. All 54 routes have offline
transport checks; 45 operation names additionally have successful actual-model
calls against real providers/stores. Scoped API and chat-cache corrections passed
independent regressions and live workflow recovery. Exactly one approved normal
production cycle ran; sync was partial and follow-up reached its limit. The user
held additional worker cycles, so complete 54-operation live acceptance remains
unverified. The concurrent prompt refactor was outside the fixed-source tests.
See the [coverage/report](../milestones/tool-operation-api-all-live-2026-10-27/verification.md)
and editable [common task log](agent-tasks.md) for actual variants and limits.
