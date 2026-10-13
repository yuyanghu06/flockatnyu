# Current backend direction — user decisions, 2026-10-11

The Tech NYU assistant is the primary product. The campus map and historical views are supporting interfaces. These decisions supersede earlier map-first framing; existing frontend work is preserved.

- Hono backend, intended deployment on Railway.
- Supabase Postgres plus pgvector for persistent knowledge.
- Daily scheduled source synchronization and summaries, retaining original records, links, provenance, timestamps and access permissions. No weekly briefing.
- Initial sources: a Discord bot and Tech NYU Google Drive. Design Drive read/write capability, but no Drive file modification is authorized by this setup task.
- Luma and Miro remain tentative/deferred. No Mural implementation.
- Model provider, member authentication and access policy remain unresolved.

The user resumed implementation with M16 Discord archive work. Current source includes an assistant/Hono backend, scoped retrieval, local SQL migrations, admin channel page and a bounded Discord daily/backfill worker. The local implementation passed independent checks; nothing is deployed, hosted migrations remain unapplied and live connectivity is unverified. Text/date/author search is primary; embeddings are optional, and weekly/monthly derived summaries are proposed while raw originals remain authoritative. See [implementation status](assistant-backend.md) for checks and open findings. MCP OAuth is for developer tooling and does not implement member login or runtime service credentials.
