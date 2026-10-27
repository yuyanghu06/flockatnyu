# Saved knowledge operations behind the private API

`memory.js` validates reads and exact-version replacement of the shared memory
note before calling the existing memory store. Its initial read entry supports
loading conversation context; model execution additionally checks the trusted
current user message and saved snapshot. Successful reads/writes update that
snapshot in memory.

`bug-reports.js` validates and bounds a report using the trusted user message and
server-created report ID before calling the existing report store. The runner
still controls once-per-message attempts. API arguments cannot substitute trusted
conversation context, the actor or the report identity.

Thin clients under `tools/memory` and `tools/bug-reports` use the private API to
reach these operations. Backend operations must not import those clients. Keep
saved-data reads and writes separate from provider reads and unrelated workflows.
