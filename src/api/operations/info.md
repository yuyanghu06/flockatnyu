# Private operation handlers

This folder groups server-only operation handlers for `/api/operations`.
Each method file explains its purpose, arguments and permissions. The operation
router is private and never mounted by the public website. Handlers call their
bound server service; adding a file grants no new model or source capability.

There are 54 fixed POST handlers, registered explicitly by `register.js`. Their
name/path catalogue is `server/operation-api/catalogue.js`. Provider folders cover
Google, Discord, Miro, Attio and Treg; Contacts, map, knowledge and worker folders
cover saved data and queue operations. Each URL segment has a matching directory.

The JSON envelope is `{arguments, phase?, preparation?}`; the transport also
reserves `missingArguments` to preserve an absent top-level argument. Caller
identity, source grants, lease and read capabilities are bound privately to the
concrete Request. `phase: "prepare"` and opaque preparation references support
existing worker argument preparation; they do not grant additional access. Each
request/response is at most 8 MiB. Domain schemas and limits still apply.

The public `src/api/register.js` never imports this registration. See
[tools and APIs](../../../docs/tools-and-api.md) for the complete call path and
the distinction between server lifecycle controls and model operations.
