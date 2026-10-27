# Server API endpoints

This is server-only code. `src/api` is the `/api` URL base: folders mirror URL
segments, `[id]` means a named path parameter, and each HTTP method has its own
`get.js`, `post.js`, `put.js`, `patch.js` or `delete.js` file. Each endpoint file
registers exactly one existing method/path and begins with its actual inputs,
access rules, service effects, output/failure behavior and a plain-English reason
for keeping the endpoint.

`operations/` additionally contains 54 private, server-only operation endpoints,
registered by its own router and absent from the public app. See its folder guide.

`register.js` composes the 21 active endpoints in their existing order. It is
called by `server/runtime/app.js`, which supplies configured services, authentication and
the chat runner. `_shared/` holds existing parsing, authentication and response
helpers; those files register no routes. `contacts/register.js` composes only the
saved-Contacts endpoints for isolated tests. Registration files compose endpoints
but do not introduce new URLs or invoke service operations themselves.

`healthz/get.js` is the one base-path exception: it serves public `/healthz`,
which the hosting platform already uses to check process health. It does not
claim that every database or provider is ready.

`treg/register.js` composes four **dormant** lookup endpoints for explicit isolated
tests. Production does not import it or those four handlers, so their reserved
paths remain 404 and their files stay out of production upload contexts.

Browser modules must not import this folder. Deployment includes only reachable
server modules, including complete named parameter folders under `src/api`, and
continues to deny browser source, private logs, credentials and evidence.

Google read tools, Miro and Attio use the existing shared tool endpoint and server
adapters, not invented provider-specific HTTP URLs. Website login, static files,
Miro OAuth and the internal token broker remain in `server/web.js`; collector
webhooks remain in their independent services.

## Endpoint inventory

| Method | Existing URL                       | Source file                                                                | Mounted      |
| ------ | ---------------------------------- | -------------------------------------------------------------------------- | ------------ |
| GET    | `/api/contacts`                    | [contacts/get.js](contacts/get.js)                                         | Yes          |
| GET    | `/api/contacts/:id`                | [contacts/[id]/get.js](contacts/[id]/get.js)                               | Yes          |
| POST   | `/api/contacts`                    | [contacts/post.js](contacts/post.js)                                       | Yes          |
| PATCH  | `/api/contacts/:id`                | [contacts/[id]/patch.js](contacts/[id]/patch.js)                           | Yes          |
| DELETE | `/api/contacts/:id`                | [contacts/[id]/delete.js](contacts/[id]/delete.js)                         | Yes          |
| GET    | `/api/gmail/send-status`           | [gmail/send-status/get.js](gmail/send-status/get.js)                       | Yes          |
| GET    | `/api/gmail/send/:requestId`       | [gmail/send/[requestId]/get.js](gmail/send/[requestId]/get.js)             | Yes          |
| POST   | `/api/gmail/send`                  | [gmail/send/post.js](gmail/send/post.js)                                   | Yes          |
| POST   | `/api/contacts/import/treg`        | [contacts/import/treg/post.js](contacts/import/treg/post.js)               | Yes          |
| GET    | `/healthz`                         | [healthz/get.js](healthz/get.js)                                           | Yes          |
| GET    | `/api/status`                      | [status/get.js](status/get.js)                                             | Yes          |
| POST   | `/api/planner/runs`                | [planner/runs/post.js](planner/runs/post.js)                               | Yes          |
| GET    | `/api/planner/runs/:runId`         | [planner/runs/[runId]/get.js](planner/runs/[runId]/get.js)                 | Yes          |
| GET    | `/api/map/people/:personId/avatar` | [map/people/[personId]/avatar/get.js](map/people/[personId]/avatar/get.js) | Yes          |
| GET    | `/api/map/presence`                | [map/presence/get.js](map/presence/get.js)                                 | Yes          |
| GET    | `/api/tools`                       | [tools/get.js](tools/get.js)                                               | Yes          |
| POST   | `/api/tools/:tool`                 | [tools/[tool]/post.js](tools/[tool]/post.js)                               | Yes          |
| GET    | `/api/admin/discord`               | [admin/discord/get.js](admin/discord/get.js)                               | Yes          |
| PUT    | `/api/admin/discord/channels`      | [admin/discord/channels/put.js](admin/discord/channels/put.js)             | Yes          |
| POST   | `/api/chat/:runId/steer`           | [chat/[runId]/steer/post.js](chat/[runId]/steer/post.js)                   | Yes          |
| POST   | `/api/chat`                        | [chat/post.js](chat/post.js)                                               | Yes          |
| POST   | `/api/treg/people/email/find`      | [treg/people/email/find/post.js](treg/people/email/find/post.js)           | No — dormant |
| POST   | `/api/treg/people/email/verify`    | [treg/people/email/verify/post.js](treg/people/email/verify/post.js)       | No — dormant |
| POST   | `/api/treg/people/phone/find`      | [treg/people/phone/find/post.js](treg/people/phone/find/post.js)           | No — dormant |
| POST   | `/api/treg/companies/enrich`       | [treg/companies/enrich/post.js](treg/companies/enrich/post.js)             | No — dormant |

Preserve request signals, current source access, exact versions, field limits,
confirmed-write receipts and uncertain outcomes. A saved-data read does not fetch
its original provider content, and handlers add no automatic multi-service
workflow. All source files follow the repository formatter and 500-line ceiling.
