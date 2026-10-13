# Agent pass report: M18 classification performance

- Milestone / role / scope: M18 / independent tester / migration 004 logical
  compatibility and representative local classification performance. No hosted
  writes, Discord reads, role-timeout changes or implementation edits.
- Starting state: all 216 live archive checkpoints succeeded with 108,828 unique
  originals. Root reproduced classification HTTP 500 / PostgreSQL 57014 timeout;
  hosted buckets/members remained zero. Storage coder supplied migration 004.
- Changed files: `tests/discord-memory.test.mjs` now executes all four migrations,
  checks actual optimized RPC periods at month/cutoff/DST boundaries, and seeds
  108,828 eligible originals across 216 sources with realistic skew (50,000 in
  the first source, 25,000 in the second, remainder across 214). Three additional
  malformed-guild/channel or permission-denied originals test fail-closed grouping.
- Decisions: seed without ANALYZE to exercise newly ingested statistics; preserve
  all originals. Only the rebuild invocation is timed, with a 15-second local
  regression budget. Local WASM timings do not establish hosted RPC latency.
- Checks executed:
  - `node --test tests/discord-memory.test.mjs > evidence/m18-discord-memory/performance-tests.log`
    exited **1**. First optimized rebuild took **30,001.5 ms** and exceeded the
    15-second budget. Failure preserved in `performance-first-failure.log`.
  - `node --test --test-name-pattern='local PostgreSQL|rolling|New York|Monday|memory store' tests/discord-memory.test.mjs > evidence/m18-discord-memory/migration-four-logic.log`
    exited **0**, **17/17** selected logical checks passed, including actual RPC
    period parity. Representative scale test deliberately excluded from this
    second command; this observation preceded the revised implementation.
  - Unchanged `node --test tests/discord-memory.test.mjs > evidence/m18-discord-memory/performance-tests.log`
    exited **0**, **18/18** passed. Rebuild timings **2,771.7 ms** initial and
    **2,694.8 ms** repeated, 3,139 groups; both below the same 15-second budget.
  - `node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs > evidence/m18-discord-memory/performance-integrated-tests.log`
    exited **0**, **134/134** passed, zero skips/failures. The representative
    rebuild repeated at **2,016.1 ms / 2,181.6 ms** under integrated execution.
  - `npm run build:api > evidence/m18-discord-memory/performance-api-build.log`
    exited **0**, API syntax and runtime dependencies verified.
- Findings: initial 004 inputs did not scope original guild/channel before
  bucket counting; tester reported this, coder added both predicates. Live raw
  originals had zero scope mismatches. Representative stale-statistics/skew
  performance failed because the initial plan joined classified rows to inserted
  buckets with nested loops. The revised implementation assigns a shared UUID
  within each source/tier/period partition and uses it directly for both inserts.
  The unchanged tester fixture passed. All 108,828 eligible originals are uniquely
  assigned, with exact daily 10,882 / weekly 10,883 / monthly 87,063 membership
  counts. All three malformed/denied fixtures are excluded; source scope,
  period containment and bucket counts match. Repeated rebuilding preserves all
  logical groups/counts and original rows; stale revision rejection preserves
  all memberships. No read grants, vectors or generated summaries were created.
- Acceptance verdict: **PASS** for local migration 004 compatibility and
  representative performance. Hosted classification/membership verification
  remains pending; local WASM timing does not establish actual hosted latency.
  Catalogue/raw archive/checkpoint verification remains independently passed.
- Folder-guide updates needed: orchestrator should record the eventual pass and
  resolved findings in the evidence guide and milestone journal.
- Handoff: orchestrator may review and apply the final revised 004 within the
  authorized rollout. Tester will independently verify hosted membership, tier,
  ACL and final catalogue after root reports successful classification. No hosted
  performance or Railway schedule/deployment health is claimed by this pass.
