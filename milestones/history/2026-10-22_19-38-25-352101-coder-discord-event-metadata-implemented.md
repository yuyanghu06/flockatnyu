# Event-local Discord metadata reconciliation implemented

- Local timestamp / acting role / milestone: 2026-10-22T19:38:25.352101-04:00 / coder / live-planner-calendar-tests.
- Requested scope: unblock new-channel ingestion without waiting for archive inventory.
- Starting state: full discovery held Gateway queue; existing same-revision published metadata available; pre-existing dirty changes preserved.
- Work performed / changed files: new server/discord/metadata-reconcile.js and migration044; narrow edits to discovery.js, event-cli.js, event-listener.js, gateway.js and added store methods. No old migrations modified. Parent inspected actual diff/source.
- Decisions: verify exact target/ancestor metadata through existing permission-checking REST client; service-only publication requires current proof and relevant published/staging hash snapshot before REST. Preserve stable UUID/manual flags, target-only allocation, deny malformed/foreign data without checkpoint, withdraw affected descendants, fence old scans with restartRequired and allow safe fresh restart. Periodic scans remain separate; budgets/timeouts unchanged. No history import or source-body retention added.
- Checks/evidence: coder reports69 existing discovery/event/refresh cases passed, API build passed and all44 migrations load in fresh local PGlite with invoker/fixed search path RPCs. Independent new SQL/Gateway checks and evaluator review are still running.
- Resulting state / acceptance: implementation frozen for review, not yet accepted/deployed. No hosted DDL or runtime configuration changes.
- Remaining work and handoff: address independent findings, verify relevant permission/replay/fence behavior, apply accepted migration via MCP, package/deploy collector and test real natural Calendar/map outcomes; exact final cleanup.
