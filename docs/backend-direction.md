# Current backend direction — user decisions, 2026-10-11

The Tech NYU assistant is the primary product. The campus map and historical views are supporting interfaces. These decisions supersede earlier map-first framing; existing frontend work is preserved.

- Hono backend, intended deployment on Railway.
- Supabase Postgres plus pgvector for persistent knowledge.
- Daily scheduled source synchronization and summaries, retaining original records, links, provenance, timestamps and access permissions. No weekly briefing.
- Initial sources: a Discord bot and Tech NYU Google Drive. Design Drive read/write capability, but no Drive file modification is authorized by this setup task.
- Luma and Miro remain tentative/deferred. No Mural implementation.
- Model provider, member authentication and access policy remain unresolved.

Current implementation is an incomplete assistant/Hono scaffold with streaming provider adapters, scoped repository, local SQL migration and no-op worker boundary. Development is stopped at the user's request for a documented dev-branch snapshot. Nothing is deployed; migrations are unapplied and live connectivity is unverified. See [implementation status](assistant-backend.md) for checks and open findings. MCP OAuth is for developer tooling and does not implement member login or runtime service credentials.
