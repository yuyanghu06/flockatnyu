# Tools through operation APIs

Goal: make every model operation follow thin tool → private API → operation
service → provider client or saved-data store. Keep one method file per fixed URL,
grouped by provider/responsibility, with technical and plain-English comments.

Scope covers the 54 existing operations used by chat and the worker. The API runs
inside each process and is absent from public route registration. Preserve source
permissions, exact reads/versions, private raw data, uncertain-write protection,
worker lease/audit ordering and separately named Calendar-to-map synchronization.
No remote transport, new business workflow or deployment belongs to this pass.

Completion requires integrated modules, accurate folder guides, static checks and
independent review. Runtime acceptance remains pending because the user stopped
tests; do not restart them implicitly. Actual status/evidence lives in the rolling
milestone and its immutable linked pass entries.
