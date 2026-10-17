# M27 independent tester report

- Milestone / role / scope: M27 / actual specialist `miro_test` / daily read-only
  Miro ingestion, migration 012, isolated deployment context, read-only assistant
  tools and HTTP/model-context wiring.
- Starting state and files inspected: AGENTS.md, rolling milestone and to-do,
  latest M27 planner history, managed workflow/report templates, tester config,
  M27 acceptance guide, Miro research, migration 001 and 012, server/miro modules,
  server/miro-tools.js, assistant-context.js, app.js, config.js, deployment
  Dockerfile and context preparation tool. Concurrent M25/M26 and unrelated
  working-tree changes were preserved.
- Work performed and changed files: created five independent test files:
  `tests/miro-client.test.mjs`, `tests/miro-snapshot.test.mjs`,
  `tests/miro-sql.test.mjs`, `tests/miro-deploy.test.mjs` and
  `tests/miro-tools.test.mjs`. Created this evidence and its folder guide. No
  implementation, shared tracking, cloud resources or other agents' files edited.
- Decisions and assumptions: API fixtures represent documented ordinary objects
  and nested group envelopes; all secrets and content sentinels are fake. Real
  migration execution uses PGlite with pgvector and the real 001 migration,
  followed directly by 012 without depending on 011. A fake HTTP transport bridges
  the real service-role store and runner to real SQL RPCs. Provider fixtures inspect
  the actual final model prompt without invoking a model.
- Checks: `node --test tests/miro-*.test.mjs`: exit 0, 23 tests passed, 0 failed,
  0 skipped, approximately 1.6 seconds. Executed on Node v25.8.0.
- Checks: `node --test tests/assistant-context.test.mjs
  tests/assistant-connectors-api.test.mjs tests/assistant.test.mjs`: exit 0,
  30 tests passed, 0 failed, 0 skipped. Existing non-Miro retrieval budgets,
  authorization, cancellation, fallback policy and chat transport still pass.
- Verified behavior:
  - Explicit board/team scope, fixed-origin GET with redirect refusal, safe
    401/403/404 failures, bounded 429 retry, cancellation and byte/request/page
    budgets. 6 AM New York gate tested in summer and winter.
  - Real client plus snapshot follows item pagination and retains original HTML,
    card detail, unknown fields, coordinates, parentage, rotations, connector
    captions/endpoints, tags and group membership. Incomplete pages, repeated
    cursors, duplicate IDs, missing relationship access and continuously changing
    boards fail without a complete publication.
  - Nested group continuation works at both container and nested page levels;
    missing or conflicting continuation fails closed.
  - Actual SQL denies browser table/helper RPC access, enforces forced RLS and
    requires both a durable member read grant and an explicit source allowlist.
    Registration creates no member grants and preserves existing source kinds.
  - SQL rejects duplicate lease claims, old tokens, expired leases, disable/enable
    ABA races and source pause/reactivation races. Complete empty snapshots replace
    deleted objects; invalid snapshots cannot publish. Failure preserves the old
    snapshot and version.
  - Real runner/store/SQL publishes a raw snapshot, then retains it when detail
    retrieval becomes forbidden; status becomes blocked and lease is cleared.
    Disabled and out-of-schedule execution makes no store calls. Logs omit raw
    content and fake secrets.
  - Deployment preparation creates fresh directories and omits `.env` and
    unrelated code; a symlink attempting to import a fake credential file is denied.
  - Live tools check ACL before API access, reject malformed arguments and team
    mismatch, retain page/scope notices, reconstruct large original objects exactly
    from JSON fragments and flatten group membership correctly.
  - Actual Hono HTTP chat reaches four planning rounds: authorized catalogue,
    frame overview, frame items, original item detail. HTML, coordinates and parent
    calendar title reach the final provider prompt. Denied Miro access causes no
    live content fetch and no stored-summary fallback. Responses omit fake tokens.
- Findings / failures / unavailable checks: initial tool test reproduced nested
  group membership returning an envelope instead of individual objects. Root
  integrated the worker's shared normalizer; the regression now passes. A possible
  overview type-filter concern was checked against the final real client and
  passes. Initial 401 expectation was updated to the intended `auth_required`
  behavior. No unresolved local test failures remain. Live Miro credentials/board
  scope, actual model behavior, cloud migration/deployment, cron execution, real
  board counts/visual comparison and Railway Node 22 runtime were not exercised
  by this tester. Lease exclusion is verified with overlapping claims against
  real SQL; separate networked PostgreSQL sessions were not available.
- Acceptance verdict and remaining work: PASS for the implemented local worker,
  SQL authorization/publication boundaries and assistant access checks. This is
  not acceptance of an active daily service or complete real-board coverage.
- Folder-guide updates needed: this evidence folder is documented. Orchestrator
  should refresh `tests/info.md`, shared evidence guide and milestone journal.
- Handoff and recommended next action: parent should record this pass, complete
  independent evaluation, apply/deploy within authorized scope, and verify an
  explicitly scoped real board when credentials are available. Keep deployment,
  schema and initial successful sync claims separate.

## Final continuation-coverage retest

After the evaluator identified an outer group total mismatch, the orchestrator
updated the live tools to disclose incomplete pagination. The tester added two
focused regressions in `tests/miro-tools.test.mjs`: nested group content with
outer `{total:2,size:1}` and one returned object, and board/group pages carrying
`links.next` without a usable cursor. The total mismatch returns partial with
`coverage.complete=false`; a group next link fails closed; board next links and
remaining totals return partial. None claims complete coverage.

Final command: `node --test tests/miro-*.test.mjs`. Result: exit 0, **25 passed**,
0 failed, 0 skipped, approximately 1.4 seconds. This supersedes the earlier
23-test count. Local acceptance remains PASS; the live/cloud limitations above
remain unchanged. Only owned test/evidence files changed in this follow-up.
