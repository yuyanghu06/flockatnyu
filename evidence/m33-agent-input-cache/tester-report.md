# Agent pass report

- Milestone / role / scope: M33 / independent tester / local migration018 shared
  two-column agent input cache. Verdict: PASS for assigned local SQL acceptance.
- Starting state and files inspected: read AGENTS.md, current milestone/to-do,
  latest shared-input-cache plan history, docs/agent-workflow.md, tester role and
  report template, package manifest, existing catalogue/cleanup PGlite tests and
  migration018. Extensive existing dirty work was preserved. Coder's migration
  was inspected and executed independently; no implementation was edited.
- Work performed and changed files: added tests/agent-input-cache-sql.test.mjs,
  updated tests/info.md, and added this evidence folder's guide, logs and report.
  Tests execute actual001–017 migrations, populate existing knowledge source,
  Discord policy and Miro board data, then apply018. Snapshot checks preserve
  original table definitions, constraints, RLS flags, ACLs, rows and public
  function definitions/ACLs. The actual fourth table is agent_input_cache.
- Decisions and assumptions: service_role has BYPASSRLS, matching existing local
  Supabase tests and the expected backend role. Three non-bypass roles represent
  anon, authenticated and PUBLIC-only access. Broad default table privileges are
  deliberately granted before018 to ensure its explicit revokes remove them.
  JSONB semantic equality is tested; original JSON whitespace/key ordering is not
  retained by JSONB. JSON null is valid; SQL NULL is rejected.
- Checks: `node --test tests/agent-input-cache-sql.test.mjs` completed exit0;
  final result10/10 passing, zero skipped, zero failed. See tester-sql.log.
  Nine behavioral subtests plus parent cover:
  - Actual001–017 populated schema/data/function/ACL preservation.
  - Exactly uuid UUID primary key/default and required raw_response JSONB; no
    provider CHECK restrictions, application triggers or client RLS policies.
  - Nested native Discord and Gmail payloads, unknown-provider envelopes,
    envelope-free objects, arrays and scalar JSON round trips as service_role.
  - Sixty-four unique generated UUIDs and an explicit caller UUID.
  - Duplicate UUID23505, SQL NULL/omitted payload23502 and malformed JSON22P02.
  - Service_role CRUD only; TRUNCATE/REFERENCES/TRIGGER privileges denied;
    explicit actual service TRUNCATE rejection.
  - Actual CRUD denial for anon/authenticated/PUBLIC-only roles, not merely ACL
    catalog inspection.
  - Independent RLS denial on populated rows after artificially granting those
    roles CRUD: reads empty, insert rejected by RLS, update/delete affect no rows,
    and original data remains exact. Artificial grants are removed afterward.
  - Actual service select/insert/update/delete; deleting exact successful UUIDs
    leaves a row inserted after batch selection and is safe to retry.
- Findings / failures / unavailable checks: initial run exit1 with8 passing and
  2 failed (one child assertion plus parent), because the test assumed pg_constraint
  contained only PRIMARY KEY. Installed PostgreSQL18 also exposes NOT NULL there.
  Initial output preserved in tester-sql-initial.log; the test filters NOT NULL
  catalog entries because nullability is separately verified and enforced. No
  migration change was needed. No product defect was found. Hosted PostgreSQL,
  PostgREST schema reload, integrations, concurrent worker behavior and deployed
  ingestion/cleanup were not exercised. The later-arrival test uses sequential
  SQL to reproduce the arrival boundary; it is not a multiconnection lease test.
- Acceptance verdict and remaining work: PASS for local schema-only acceptance.
  Source scoping is necessarily backend-owned because this deliberately generic
  table has no provider columns or RLS source policies. Scheduling, durable
  facts/actions, failure retention, source subscriptions and backend cleanup are
  future implementation, not provided by this migration.
- Folder-guide updates needed: assigned tests/info.md and this folder's info.md
  updated. Orchestrator owns shared evidence/milestone guides and journal.
- Handoff and recommended next action: orchestrator should inspect tests/logs,
  record this pass in the milestone journal and obtain independent evaluator
  acceptance. No cloud application, deployment, network access, dependency change,
  credential access, subagent spawning or shared journal edits were performed.
