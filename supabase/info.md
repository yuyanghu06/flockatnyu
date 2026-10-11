# Local knowledge-storage schema

The versioned SQL in `migrations/202610120001_knowledge.sql` is **local and
unapplied**. No Supabase project, credentials, cloud schema or external connector
was created or contacted by this implementation. A repository reporting
`configured` means its environment is present, not that a database connection or
migration has succeeded.

## Server contract

`server/knowledge.js` exports `createKnowledgeRepository({env, fetchImpl})`.
Only the backend may import it. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
remain server-side; never use a `VITE_` prefix, return them to the browser, or log
upstream database response bodies. HTTPS is required except explicitly local
loopback Supabase development URLs.

`search({query, principal, limit, buildingId, signal})` returns `{status,sources}`.
The principal must come from trusted backend authentication, never request JSON.
It contains a UUID member identity (or the exact development identity
`local-development`) and a nonempty UUID `allowedSourceIds` list. Missing or
invalid scopes cause no database request. The development identity does not
bypass database permissions; explicit source and document grants are required.
Auth-mode enablement belongs to the backend, not this repository.

Queries are bounded to 500 characters, eight results, 1,800 characters per excerpt
and 12,000 excerpt characters overall. Search returns stable chunk/document/source
IDs, title, original URL, excerpt, source-update/index timestamps and building ID.
Every RPC sends the principal and server-approved source allowlist. The SQL then
requires the intersection of that list, an active source, source membership with
`can_read`, active document status, and document membership with `can_read`.
Revoking either permission excludes the document. An empty result is `empty`, not
an invented answer. Configuration, denial, cancellation and upstream failure have
separate normalized statuses without credentials or raw database error messages.

## Records and future ingestion

Tables store source identity/status, source member permissions, original document
text/URLs/version/times/location confidence, document permissions, chunks, daily
summaries and sync cursors/status. All seven tables enable and force RLS with no
anon/authenticated policies; privileges are revoked from public, anon and
authenticated. RPC execution is explicitly revoked from those roles and granted
only to `service_role`. Functions are security-invoker with an empty search path
and fully qualified table references. The service credential is powerful; the
application must always use the guarded repository, not expose generic REST
access or accept user-supplied principals.

`getDocument`, `upsertDocument` and `deleteDocument` are controlled server-side
storage operations for a future authorized ingest adapter. Writes require both
an allowed source and `can_write` membership. Document ACL foreign keys bind each
grant to its document/source pair and source member record; deleting source
membership cascades its document grants. Document ACLs cannot exceed source
read grants. Upsert atomically replaces the current original/version, chunks and
ACL. A missing/empty document ACL grants nobody read access. Chunk IDs are
stable document-plus-ordinal identifiers; no embeddings are fabricated. Deletes
are scoped to both document and source and cascade chunk/ACL removal. This stores
the current original record, not an immutable historical revision archive.
Source provisioning and grant management require a separate trusted administrative
process; no automatic all-members policy or placeholder grants are installed.

The vector column reserves `extensions.vector(1536)`; model and provider are not
selected, and embeddings and their provenance remain null. Search currently uses
English PostgreSQL full-text search (`websearch_to_tsquery`) and a GIN index.
There is no live embedding call or vector similarity claim. A future model change
must explicitly migrate dimensions/model provenance rather than mix vectors.
Daily summaries are protected storage only; no summarization connector runs yet.

`server/worker.js` is a separate one-shot entry point suitable for a future daily
scheduler. It truthfully returns `no_op` if storage/sources are absent, or if
connector adapters are unimplemented. It never marks a source successfully synced.
`KNOWLEDGE_SYNC_SOURCE_IDS` is a future comma-separated worker source list, not an
authorization grant. No scheduler is installed and no weekly briefing, Luma, Miro
or Mural integration exists.

## Verification and references

Run `node --test tests/knowledge.test.mjs`. Fourteen fixture tests exercise request
formatting, access boundaries, controlled CRUD validation, bounded context,
cancellation, error redaction and truthful worker status. SQL privilege/ACL
contracts are inspected as source; this does **not** prove successful PostgreSQL
execution. Apply and test migrations in an authorized local/staging Supabase
instance before enabling a real ingestion adapter or relying on live retrieval.

Primary implementation references:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase vector columns](https://supabase.com/docs/guides/ai/vector-columns)
- [PostgREST named RPC arguments](https://docs.postgrest.org/en/v12/references/api/functions.html)

The implementation uses native server fetch against PostgREST; an MCP connection
is neither its runtime database transport nor an unattended worker.

