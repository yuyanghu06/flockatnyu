# M20 summary storage coder pass

- Role / scope: coder; service-only resumable Discord daily/weekly/monthly summary storage and budget accounting. No hosted mutation, secret read, model call or deployment.
- Inputs inspected: project instructions and coder/report templates, current milestones/to-do, applied migrations 001–005, M18 storage contracts, and independent summary fixtures. Coordinated directly with runner/provider coder and tester; no child agents.
- Changed files: new `supabase/migrations/202610120006_discord_memory_summaries.sql`, new `server/discord/summary-store.js`, and this report only. Existing applied migrations and shared guides/journal remain untouched.

## Implemented storage and contracts

Nine forced-RLS tables store operations, fixed job manifests, original input
references, resumable parts, exact segment coverage, reduction DAG edges, request
reservations/usage and results. Every new RPC/helper remains an invoker executable
only by `service_role`. Configuration creates no member/source grants or vectors.

Jobs use source + tier + New York period key + ordered canonical input fingerprint
and provider/model/prompt identity. They have no foreign key to regenerated memory
bucket UUIDs. Canonical inputs include original ID, UTC creation/edit times,
author identity/name, content, complete retained embed/component/poll/file textual
evidence, reply ID and allowed original text links, including recursively retained button/file/embed
URLs. Link collection is bounded, canonicalized, deduplicated and never fetches a
URL; URL-only changes also invalidate fingerprints. Ordered row digests detect
changes beyond the earlier extracted-text `content_hash`. Source eligibility is
materialized before scanning originals. Input references retain per-row hashes,
ordinals and server-derived segment counts rather than duplicating all originals.

`preview`/`beginOperation` create or resume a fixed operation manifest; `getOperation`
returns progress and durable accounting. Claims and renewals use expiring leases. Separate consecutive failure counts
limit genuine failures while allowing more than ten routine budget/runtime
resumptions; new valid part progress resets that failure counter.
Paginated inputs return exact canonical text and 8,000-Unicode-codepoint segments;
an oversized first original is returned whole. Segment indices/counts are derived
by the database, so publication can prove complete coverage without trusting
caller-declared cardinality. The runner uses these fragments without truncating or
resegmenting them.

Claims can complete cached-only publication even at an exhausted operation
budget; any new paid dispatch still requires the atomic reservation gate.

Each dispatch first reserves a unique request ID and worst-case cost atomically
against an operation capped at $5 and its request limit. Reusing that ID never
permits another dispatch. Successful observed usage releases unused headroom;
unknown/failed attempts conservatively retain the full allocation. Null usage on
an uncertain attempt is normalized to an empty accounting object by the store.
Map/reduce parts require a successfully committed reservation for the same job.

Parts validate source-bound citation IDs, exact map segments and existing child
provenance. Cache idempotency checks summary, input hash, coverage and DAG edges.
Final publication requires complete original/segment coverage, all map parts
reachable from the final reduction, the current fingerprint, revision, source
eligibility and lease. SQL generates final citation URLs from trusted guild/channel/
message IDs. Original mutations invalidate jobs; read RPCs require both durable
source grants and the trusted request source list. Result pagination applies its
limit after stale fingerprint filtering, so skipped stale rows cannot hide later
current results or falsely terminate a page.

Guards lock policy rows and the existing discovery/memory transaction mutexes
before operation/job updates. Scoped reset preserves its prior paused/revision
guard, deletes only the target guild's summary jobs/results/parts/coverage/accounting
and raw archive, and retains unrelated guilds, operators, source ACLs and policy.

## Actual checks

- Genuine PGlite + pgvector: all six migrations applied.
- An executed end-to-end SQL fixture passed preview, fixed operation creation,
  lease claim, retained embed/component-only evidence, cost reservation and usage,
  map coverage, publication, replacement of a supplied incorrect citation URL with
  its canonical Discord URL, read denial/grant and completed-job reuse after memory
  bucket UUID regeneration.
- `node --test tests/discord-summary-sql.test.mjs`: 12/12 passed after fixing two
  PL/pgSQL local-variable/query-alias collisions. Independent fixtures cover forced
  RLS/service-only execution, fingerprints, cache reuse, leases, Unicode/control
  reconstruction, uncertain accounting, foreign/incomplete provenance, publication,
  read permissions, pause/blacklist invalidation and scoped reset. After final pagination/cache/link/retry hardening,
  `node --test --test-name-pattern='genuine six|one-request|cached-only' tests/discord-summary-sql.test.mjs`
  passed **15/15**, including stale-row pagination, component URL-only fingerprint
  invalidation, more than ten one-request resumptions and exact operation-cap
  cached-only publication with zero additional dispatches.
- Representative PGlite fixture exactly matched the initial collection shape:
  **108,828 originals, 779 groups, 213 nonempty sources and 216 eligible sources**.
  Preview took **10,361 ms**, initial operation creation **11,522 ms**, and resume
  **9,681 ms**. Canonical input totaled 29,710,044 characters. All 108,828 input
  references were unique and source-scoped; no snapshots changed on resume.
- Preview/begin SQL functions have their own 60-second timeout and 16 MB work
  memory settings, with matching 65-second store deadlines. Other summary RPCs
  retain 12-second client deadlines. No role/database timeout changes were made.
- `node --check server/discord/summary-store.js`, API import/syntax build and
  `git diff --check` passed after these fixes.

## Limits and handoff

Local storage acceptance is established by executed fixtures; final independent
runner/provider/evaluator integration is owned by the parent. PGlite timing is not
hosted timing. The representative manifest is slower than local classification;
actual hosted preview/creation must finish within the scoped 60-second budget
before model dispatch. If it does not, an unapplied redesign or a new follow-up
migration is needed after application, preserving immutable hosted history.

Root owns journal/history, folder guides, provider credential setup and authorized
hosted migration/model/deployment work. No actual AI summaries are claimed by this
storage pass: fixture summaries were synthetic, and embeddings remain off.
