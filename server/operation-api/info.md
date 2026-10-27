# Private operation API

Model tools call fixed HTTP-shaped operation endpoints through an in-process Hono
router. The router is not mounted on the public website and makes no network hop.
Each concrete Request receives an unforgeable server-side binding to its service,
principal and existing request/cycle context. JSON and headers cannot grant access.

`catalogue.js` lists fixed operation URLs; existence never exposes a tool to a
session. `app.js` registers one documented endpoint file per operation.
`arguments.js` rejects non-JSON values instead of silently changing them.
`dispatch.js` authenticates, rechecks session validity after parsing, bounds JSON and calls the bound service. `session.js`
retains private read/preparation capabilities and returns only JSON data.
`adapter.js` supplies thin clients and trusted lifecycle controls. Nothing here
silently chains operations, changes leases/budgets or exposes raw credentials.

This is a local API boundary. Remote HTTP transport and its session credentials
are deliberately not implemented. Existing service permissions remain mandatory.
