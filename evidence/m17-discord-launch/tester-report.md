# Agent pass report

- Milestone / role / scope: M17 / independent tester / local Discord launch CLI,
  historical backfill, strict worker, isolated Railway payload. Local PASS;
  hosted launch remains incomplete.
- Starting state and files inspected: AGENTS.md, rolling milestone and to-do,
  latest M17 planner history, workflow, assignment/report templates and tester
  config; existing client/config/store/sync/worker/tests; coder CLI and parent
  deployment implementation. Existing worktree changes preserved.
- Work performed and changed files: added `tests/discord-launch.test.mjs`,
  appended M17 guidance to `tests/info.md`, and added only this evidence folder.
  No application, package, shared journal, cloud configuration or credentials
  changed.
- Decisions and assumptions: use injected Discord/store responses and an
  in-memory store checking optimistic cursor/window/success comparisons.
  Successful launch must catch up an unfinished historical window to its fixed
  captured launch target. New arrivals after that target belong to subsequent
  scheduled collection. Existing SQL tests exercise both migrations in local
  PostgreSQL/PGlite with pgvector. Hosted migration claims from the parent were
  not independently exercised in this pass.
- Checks: `node --test tests/discord-client.test.mjs tests/discord-sync.test.mjs`
  baseline exit 0, 15/15. Final command
  `node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs`
  exit 0, **98/98**, zero skipped; output in `local-tests.log`. This includes
  **23 launch/deployment tests** checking approved/limited Message Content
  capability, private-thread membership/moderator access without joining,
  missing token/storage/schema/admin/operator, wrong guild/channel, earliest
  2015 cutoff and 220 pre-2026 originals, bounded runs and resumable state,
  old-window catch-up, abort/checkpoint preservation, error/stall stops,
  sanitized malformed codes/exceptions, stopping later channels after first
  runtime failure, strict CLI exits, real process SIGTERM handling, copied
  deployment runtime/allowlist and file/directory symlink rejection.
  `npm run build:api` exit 0; output in `api-build.log`.
  `docker --version` exit 0 (28.3.3), but
  `docker info --format '{{.ServerVersion}}'` exit 1: Docker daemon unavailable
  at the configured local socket. No container build executed.
- Findings / failures / unavailable checks: no material implementation failure
  remains from these tests. Two temporary fixture mistakes were corrected
  before final execution: keep the signal fixture event loop active, and supply
  a valid Response init object for a mocked HTTP 403. Docker container build,
  real bot intent/permissions/membership, actual historical Discord reads,
  hosted application credentials/RPC execution, Railway deployment and daily
  schedule execution were not tested. These require the separate live launch
  handoff and credentials.
- Acceptance verdict and remaining work: local CLI/backfill and deployment
  preparation acceptance passes. M17 completion still requires user-selected
  guild/channels/threads, bot and storage configuration, provisioned trusted
  operator, real initial archive verification and an observed Railway run and
  schedule. No real message counts or healthy running service are claimed.
- Folder-guide updates needed: tester updated tests/info.md and this folder's
  info.md. Orchestrator owns shared evidence/milestone guides and journals.
- Handoff and recommended next action: integrate/journal local acceptance,
  then complete the authorized runtime setup with explicit Discord scope and
  verify the live backfill before enabling scheduled collection.
