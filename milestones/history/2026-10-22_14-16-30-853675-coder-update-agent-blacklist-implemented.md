# update agent blacklist implemented

- Local timestamp / acting role / milestone: 2026-10-22T14:16:30.853675-04:00 / coder / discord-blacklist.
- Requested scope: Fix blacklist/static-source mismatch for both chat and update agents.
- Starting repository state: Accepted planner contract with isolated specialist ownership; existing publication journal changes preserved.
- Work performed / changed files / decisions: Worker coder implemented fresh preclaim scope resolution, refreshed effective principal grants and exact live enqueue authorization in automation/adapters.js/handler.js/info.md with six new tests in tests/update-agent-discord-scope.test.mjs. Claims include fresh Discord plus explicit Gmail only; old static Discord grants cannot restore disabled-channel queue selection. Independent-claim live reauthorization remains. Broad145tests/API build/whitespace passed. Synthetic exact identity/map upsert/Calendar completion/finish flow passed. No live/schema changes. Ready for independent integration testing and review.
- Checks and evidence: Exact specialist commands and results are recorded in the report above; no unexecuted live acceptance is claimed. Shared tracking is written only by the orchestrator.
- Resulting state / acceptance: Local implementation ready; full independent integration/evaluation gates pending.
- Remaining work and handoff: Resolve test/review findings, verify source-only deployment packages and actual hosted release before claiming production behavior.
