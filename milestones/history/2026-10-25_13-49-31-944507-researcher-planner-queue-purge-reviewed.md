# Queue purge scope and fencing reviewed

- Local timestamp / acting role / milestone: October25 2026,1:49PM America/New_York / researcher / planner-48h-review-2026-10-25 follow-up.
- Requested scope: user explicitly requested clearing the entire queue and accepted data loss. Read-only specialist planned minimal removal of queued work.
- Starting state: all queued originals in agent_input_cache; deferred work in agent_pending_tasks; manual queued/running requests in agent_manual_runs; runner/input/action/subscription metadata in agent_automation_state.
- Work performed / changed files: local migration and runner reads; no edits, external calls or mutations. Identified advisory lock420022,1 and runner row lock, token removal, pending-task/manual/input deletion and worker restart.
- Decisions: preserve completed input deduplication tombstones, terminal manual statuses, action receipts, collector replay checkpoints, audit and Calendar/map/source records. Remove all originals, pending/quarantined work and saved follow-up tasks. Keep runner row and remove active token/lease/snapshot/sources.
- Checks and evidence: enqueue/renew migration019, task lease migration039, map lease041, manual lock/claim/finish042, manual-worker in-memory dispatch. Active external Calendar requests cannot be undone by queue deletion; invalidating the lease and restarting closes old in-memory continuation.
- Resulting state / acceptance: bounded operational plan accepted. Orchestrator owns live execution, verification and shared journals.
- Remaining work and handoff: execute explicit transaction, restart existing worker without a new build and verify all work-queue counts zero. New ingestion remains enabled.
