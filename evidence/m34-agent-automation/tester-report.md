# Agent pass report

- Milestone / role / scope: M34 / independent tester / event updater, bounded
  tool-calling worker, native provider tool rounds and local migration019.
- Starting state and files inspected: project instructions and milestone/to-do,
  tester role/report/assignment templates, migration018 tests, actual automation
  modules, provider toolTurn,001–019 SQL and existing provider/chat/Google tests.
  Coders supplied contracts; actual files were independently read and exercised.
- Work performed and changed files: added tests/agent-automation.test.mjs and
  tests/agent-automation-sql.test.mjs, updated tests/info.md and this evidence
  folder. No application/SQL/shared journal edits; no child agents or live calls.
- Decisions and assumptions: run metadata tests against real PGlite001–019 SQL;
  worker/model tests use controlled synthetic adapters. service_role BYPASSRLS
  matches existing fixtures. Injected clock and explicit metadata aging avoid
  waiting five minutes. Overlapping claims/CAS use one PGlite connection's queued
  execution; this verifies serialized behavior but is not a deployed concurrency
  or process-crash proof. Worker instances are reconstructed for restart/replay
  tests, while durable receipts remain shared.
- Checks: executed command (exit0):

  `node --test tests/agent-automation.test.mjs tests/agent-automation-sql.test.mjs tests/agent-input-cache-sql.test.mjs tests/backend-provider.test.mjs tests/assistant.test.mjs tests/provider-tool-compatibility.test.mjs tests/google-connector.test.mjs`

  Result84/84 passing,0 failed/skipped. See tester-tests.log. New M34 tests are
  25 worker/provider tests and11 SQL tests (10 substantive plus parent).
  SQL tests apply the full historical chain, seed source/policy/Miro rows and
  preserve those rows while018 retains exactly uuid/raw_response. State/RPCs
  require service access and forced RLS blocks client CRUD even after artificial
  grants. Distinct updates/revisions, authoritative receipt time, five-update OR
  five-minute trigger, empty/waiting/busy/cooldown, competing claims, renewal,
  expiry/fencing, release/restart, five-minute retry deferral for failed/unhandled
  snapshot inputs, new arrivals remaining eligible, successful receipts and exact subset/hash-fenced
  cleanup are exercised. Subscription CAS rejects stale writers and protected
  namespaces. Model/action/cleanup authorization is rechecked. Invalid names,
  arguments/IDs/schema/finish sets, mixed completion, failed/oversized actions,
  cancellation and round/call budgets all retain unfinished input. Native OpenAI
  and Anthropic payloads preserve call/result IDs and reject incomplete histories,
  truncation/oversized responses; existing chat/provider/Google tests stay green.
- Findings / failures / unavailable checks: independent review found the initial
  action identity depended on all batch UUIDs, allowing a later arrival to change
  an already-successful action's key. Coder corrected it to explicit validated
  related-input UUIDs plus tool name/canonical arguments before final acceptance.
  A regression proves successful action replay is suppressed after incomplete
  completion and changed batch membership. Read-only tools bypass write receipts
  and retrieve fresh context on the next attempt. Test-development syntax and
  scalar-JSON fixture issues were corrected locally without implementation edits.
  Evaluator's intermediate rerun found79/82 due to fixtures reusing an action ID
  for a later finish after cross-turn ID enforcement was added. Fixtures now use
  distinct finish IDs; an explicit cross-turn reused-ID rejection test and a
  nonblocking wake-up test are included in the final84/84 run. Final019 row-lock
  hash-fenced cleanup and five-minute metadata backoff are exercised; deferred
  source bodies are retained, fresh arrivals proceed, and aged deferrals retry.
  No live provider, real external action, hosted database/PostgREST, real multiworker
  Railway deployment,20-second heartbeat timer or Google subscription is claimed.
- Acceptance verdict and remaining work: PASS for implemented local M34 boundary.
  External write adapters must honor the supplied stable idempotency key; a crash
  after an external side effect but before receipt storage still requires that
  downstream idempotency. Source adapters/principal are explicitly required;
  absence remains not_configured. Concrete map/calendar/context integrations and
  durable semantic context are separate work, not fabricated by the worker.
- Folder-guide updates needed: tests/info.md and this evidence guide updated;
  orchestrator owns shared journal/evidence index changes.
- Handoff and recommended next action: journal and independently evaluate M34.
  Tester continues separately with M35 Gmail subscription fixtures.
