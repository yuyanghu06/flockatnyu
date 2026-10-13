# Agent pass report

- Milestone / role / scope: M18 / independent tester / automatic blacklisted
  guild discovery, scoped reset and permission-aware daily/weekly/monthly
  original-message storage. **Local PASS**.
- Starting state and files inspected: project instructions, milestone/to-do,
  tester role and report template, prior archive SQL/PGlite and M17 tests;
  root CLI/normalization/retrieval changes and both coders' discovery/config/
  client/store/memory/migration contracts. Preserved existing worktree changes.
- Work performed and changed files: new `tests/discord-discovery.test.mjs` and
  `tests/discord-memory.test.mjs`; expanded explicitly assigned
  `tests/discord-launch.test.mjs`, `tests/discord-sync.test.mjs`,
  `tests/discord-client.test.mjs` and `tests/discord-api.test.mjs`; wrote only
  this evidence folder. Provider/store suites required no expectation edits.
  No implementation, shared tracking, runtime secrets or hosted writes by tester.
- Decisions and assumptions: exact 168-hour recent cutoff; New York calendar
  days, Monday weeks clipped to current month/recent cutoff, prior-month buckets
  clipped by recent precedence. Buckets retain original members, without AI
  summaries, vectors or image downloads. Explicit paused discovery previews
  metadata; paused scheduled collection reads no Discord history. All-private
  archived threads are discovered only with already-held ADMIN/MANAGE_THREADS;
  otherwise the remaining unjoined-private limitation is reported.
- Checks: final command
  `node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs`
  **exit 0, 132/132 passed, zero skipped** (`local-tests.log`).
  `npm run build:api` **exit 0** (`api-build.log`).
  `git diff --check -- tests/discord-launch.test.mjs tests/discord-sync.test.mjs tests/discord-client.test.mjs tests/discord-api.test.mjs tests/discord-discovery.test.mjs tests/discord-memory.test.mjs`
  **exit 0**; no whitespace findings.
  Final coverage includes **11 discovery tests**, **16 memory/store/PostgreSQL
  tests**, **28 launch tests** (five new management/integration cases) and
  **11 sync tests**. Discovery checks cover inherited exclusions, unknown/cyclic
  ancestry, permission loss, active/archive dedup, durable pagination/generation
  resume under budgets, stalled cursors, wrong guild, incomplete/error inventory
  without reconciliation, joined-private snowflake versus public/private
  timestamp cursors, existing moderator access and read-only API endpoints.
  PostgreSQL tests apply all three migrations with real pgvector, exercise
  policy admin/revision guards, generation CAS, incomplete versus complete
  reconciliation, forced RLS/service-only helpers, hierarchy/generation denial,
  image scrubbing and JavaScript/SQL text/hash agreement, idempotent exclusive
  source memberships, exact DST/month/week boundaries, guarded bucket/member
  pagination, pause/stale-revision rejection and scoped reset. Reset tests
  confirm revision increment, invalidated discovery checkpoint, rejected stale
  writes and preservation of operator/policy/exclusions/configuration/ACLs and
  unrelated Discord/manual knowledge. CLI tests cover missing-policy creation,
  omitted exclusion flags preserving blacklist, preflight blacklist denial,
  paused/no-history collection, incomplete discovery blocking ingestion,
  completion invoking memory classification, automatic selection above 100
  channels, explicit selection bounds and admin reset requirements.
- Findings / failures / unavailable checks: reproduced the evaluator's nested
  Components V2 image retention in direct SQL persistence before its fix; final
  tests confirm gallery/thumbnail/image-file URLs removed while nested text,
  section text, ordinary links/PDF files and original body remain. JavaScript
  depth-20 containers cannot bypass its bounded stripping. Avatar/embed/image
  attachments and opaque-name image URLs are also covered. Updated superseded
  embedding-positive runtime expectations; current config/API/worker tests
  ensure stale flags or injected adapters spend no embedding calls. Dormant
  provider unit behavior remains tested only with explicit local fixtures.
  Corrected a test-only SQL NULL versus JSON null CAS fixture and reset revision
  expectation to match the strengthened contract. No unresolved material local
  failure remains. Optimistic race/interleaving guards were exercised; no
  multiprocess PostgreSQL contention stress test was executed. No live bot/API,
  hosted M18 migration/reset/backfill, Railway image/run/schedule, full server
  history/private-thread coverage or production member-auth behavior verified
  in this pass. Existing local model-provider tests use mocks.
- Acceptance verdict and remaining work: local M18 discovery/reset/original
  grouping acceptance **passes**. Live rollout needs the separately authorized
  hosted migration, verified policy/paused preview, scoped reset, observed
  collection/classification and exact Railway deployment/run/schedule checks.
  Stored groups do not establish AI summaries or embeddings.
- Folder-guide updates needed: this evidence guide is complete. Orchestrator
  owns tests/info.md and shared milestone/source guides for this pass.
- Handoff and recommended next action: evaluator reviews final implementation
  and these independent results; orchestrator journals accepted local behavior
  and handles live rollout separately. Do not infer server-wide completeness
  from the fixtures or historical single-channel M17 archive evidence.
