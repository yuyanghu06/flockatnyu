009 is applied as20261012003929_discord_summary_sliced_planning (SHA7466b2e1871d20a8c5752f0a1186802e880091353da89a7c69eaffbb4c95b59f). Local001–009 are now immutable; hosted/local version prefixes differ, do not replay db push. Forced RLS and service-only functions verified; actual REST planning is in progress with no model/prune yet.

CurrentM20:008applied but60sAPIceiling persists;009resumablemetadataqueue/oneperiodplanning active. Raw108836intact,0models/summaries/prune. Keepallapplied1–8immutable. Latestbrief sliced-planning-brief.md; largest6397canonicalactual4.375s.

Currenthostedgate:006+007applied/immutable; post007previewstill60824ms timeout, no actualmodel/summary/prune.008narrowplanning180/185proposedafter512canonical383.712ms profiling. Finish60/65/ordinary12 andretention/costcontrols unchanged. ActualAPIpreview+begin mustpassbeforeLunapilot.

Current M20 correction: per-channel RAG summaries with channel names/IDs; raw current NY Monday–Sunday week (including across month boundaries), weekly earlier current-month periods, monthly older months. No automatic prompt injection, daily summary, image or embedding. Calendar local implementation accepted:211/211/APIbuild/evaluatorPASS.006 applied20261011232316; first actualhostpreview timedout60s,007 optimization active; live originals intact and0real summaries/modelcalls/prunes. Prior rolling-window descriptions below are superseded.

# Current retention direction (M20)

The user superseded indefinite original retention: no daily summaries. Weekly
summaries on Monday mornings replace eligible older current-month raw records;
monthly summaries on the1st replace all prior-calendar-month raw and weekly
content after verified atomic publication. Target time is08:00 America/New_York.
Compacted ranges prevent the collector from re-importing discarded history.
Only final summaries, original Discord citations and minimal provenance remain
for compacted ranges. Local verbatim historical retrieval is unavailable after
compaction. No images or embeddings. This corrected lifecycle is being implemented;
no actual summary or pruning has happened yet. Earlier descriptions of permanent
original retention below describe the prior design and are superseded.

---

# Current hosted Discord schema

Migrations001–005 are applied to Tech NYU Supabase. Hosted versions are
20261011200346,20261011200348,20261011205557,20261011213945 and20261011214737;
local filename prefixes differ, so reconcile history before CLI migration work.
Seventeen tables force RLS and deny browser CRUD; service-only invoker RPCs
retain explicit source/member permissions. No reader grants are created.

M18 automatic discovery/exclusions and the scoped original rebuild are accepted:
216 sources,108836 originals and779 exclusive New York day/week/month groups.
Images and embeddings are disabled. Actual runtime grouping and the Railway
one-shot worker completed successfully; the daily archive schedule is restored.

New migration006 adds stable source/input-based summary jobs/results, complete
coverage, leases, durable parts and request/cost accounting. Its local tests and
review are in progress; hosted application and actual Luna summaries remain
pending. Originals and generated summaries have separate persistence boundaries.
Earlier sections below are historical where superseded. Current rollout evidence
and limits live in ../milestones/milestone.md.

---

# Current Discord archive schema addition

`migrations/202610120002_discord_archive.sql` extends the existing knowledge migration with admin memberships, channel configuration, original JSONB messages, observed revisions and atomic scan state. It includes service-only admin/archive/search/embedding RPCs and explicit source grants. Both migrations executed in isolated PGlite PostgreSQL/pgvector fixtures and were applied once to hosted Tech NYU Supabase in M17. Hosted tables/RLS/grants/invoker RPCs and an empty service-role sync-channel read are verified. Runtime PostgREST sync/admin reads are verified with the user-supplied key; see ../docs/discord-launch.md for MCP/local version mapping. See [archive setup](../docs/discord-archive.md). Text/structured search is primary; actual vectors are optional and use matching 1536-dimension model/provider provenance. No summaries or hosted data were generated.

The M15 notes below describe the original general knowledge schema; the old no-op worker and placeholder-only embedding statements are superseded for the Discord adapter by M16.

---

# Local knowledge-storage schema

The original M15 implementation below was local-only; M17 has since applied
the ordered knowledge and Discord migrations to hosted Supabase. No live Discord
collection or summaries are claimed. A repository reporting
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

