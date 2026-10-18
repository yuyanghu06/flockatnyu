# Agent pass report

- Milestone / role / scope: Fixed building catalogue; independent tester; SQL
  application role can change only map_buildings.people_here.
- Starting state and files inspected: AGENTS.md, notes.md, milestones snapshot
  and to-do, latest linked history, agent workflow/report template, original
  map-schema test, migrations001–022 and package commands. Broad unrelated
  frontend/assets/backend changes were preserved. Historical021 tests unchanged.
- Work performed and changed files: Added tests/map-building-write-scope.test.mjs
  and this evidence folder's info.md, local-tests.json and test-report.md only.
  Real PGlite migrations use pgvector, explicit anon/authenticated/service roles,
  populated fixtures in all five integration tables and the seeded9/26 map rows.
- Decisions and assumptions: service_role is the application's database role;
  administrator/owner migration authority is separate. Trigger-controlled
  updated_at is allowed to advance while caller assignment to it is denied.
- Checks: `node --test tests/map-building-write-scope.test.mjs` PASS11/11;
  `npm run test:map-roster` PASS26/26; `npm run build:api` PASS. All exit0.
  Actual SQLSTATE42501 rejections cover every metadata column, mixed patches,
  no-op metadata assignments, insert/delete/truncate/upsert and UPDATE FROM/CTE.
  Direct validated presence updates, automatic timestamps, SELECT/read RPC and
  atomic invoker moves succeed with column-only UPDATE. Moves preserve other
  people and independent plans. Invalid entries/moves leave prior rows intact.
  Browser/public callers cannot read/write/call the presence RPC. Nine location
  identities/names/aliases,26 people and five populated integration tables remain
  byte-equivalent as JSON snapshots across migration. Unrelated table/column/
  function ACLs remain unchanged. Repeated022 application safely removes stale
  explicit metadata-column UPDATE grants without changing data.
- Findings / failures / unavailable checks: No product failures found. An initial
  inspection used an incorrect guessed022 filename; corrected to the actual file
  before tests. No hosted writes/checks, deployments, or browser rendering checks
  performed. No agent-facing map-write tool is introduced by this migration.
- Acceptance verdict and remaining work: PASS for local SQL behavior. Parent
  owns independent review, any authorized hosted application/verification, and
  final integration/journal. This report does not claim a cloud rollout.
- Folder-guide updates needed: Evidence folder info.md provided. Parent can add
  the new independent test to tests/info.md and any desired standard test command;
  shared docs are outside tester ownership.
- Handoff and recommended next action: Review migration022 and test evidence;
  integrate/journal and separately verify hosted permissions if applying it.
