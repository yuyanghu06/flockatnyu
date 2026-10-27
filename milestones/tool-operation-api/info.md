# Tools through operation APIs

Goal: make every model operation follow thin tool → private API → operation
service → provider client or saved-data store. Keep one method file per fixed URL,
grouped by provider/responsibility, with technical and plain-English comments.

Scope covers the 54 existing operations used by chat and the worker. The API runs
inside each process and is absent from public route registration. Preserve source
permissions, exact reads/versions, private raw data, uncertain-write protection,
worker lease/audit ordering and separately named Calendar-to-map synchronization.
No remote transport, new business workflow or deployment belongs to this pass.

Implementation, static checks and independent static review are complete. The
October27 user request resumed the previously held runtime tests. Scoped API
corrections are independently accepted; actual-model/live integration limitations
remain explicit in the [runtime verification](../tool-operation-api-live-2026-10-27/verification.md).
Complete planner behavior and deployment are not established by that acceptance.
