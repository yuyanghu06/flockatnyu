# Tools and HTTP API relationship verified

- Local timestamp / acting role: 2026-10-27_15-25-07-864262 / explorer.
- Read-only audit: tools generally call server clients, services or saved-data stores directly; they do not call our own HTTP routes. Browser routes independently call those services. The generic POST /api/tools/:tool endpoint instead invokes selected tool adapters.
- Examples: Gmail send tool and HTTP endpoint share the send service; Contacts tools/routes share the store. Discord/Google/Calendar/Miro tools use provider clients, while worker controls use in-process queue/task state. Tools can add exact-read receipts, permissions, deduplication and uncertainty protection, so they are not all simple pass-through wrappers.
- No one-to-one endpoint/tool mapping. Dormant lookup endpoints have no tools; legacy HTTP Treg import searches and saves, whereas model search/enrich/import remain separate. Current explanations are in docs/tools-and-api.md and tools/info.md. No behavior or access changes were made by this audit.
