# Discord blacklist implementation contract

- Local timestamp / acting role / milestone: 2026-10-22T13:34:47.451181-04:00 / planner (discord_policy_plan) / discord-blacklist.
- Requested scope: Fix automatic channel access for chat and update agents.
- Starting repository state: Prior explanation journals plus concurrent combined-release documentation; preserve all existing changes.
- Work performed / changed files: Independent read-only planner traced web/Discord authorization, live reads, map/Calendar source evidence and scoped queue claims. No planner file edits. Orchestrator recorded this report.
- Decisions: Reuse guarded discord_sync_channels RPC from migration035 to enrich trusted request principals. Flockbot retains audience-safe nested source subset. Worker resolves fresh Discord plus explicit Gmail queue grants before each scoped claim; keep baseline non-Discord grants separate. No migration is needed. Direct updater enqueue must authorize new sources from exact live catalogue bindings before first tick. Existing live authorization and final policy/source rechecks remain mandatory.
- Checks and evidence: Planner inspected relevant auth/runtime, Discord, automation, map and Calendar code plus migrations017/032/035/036. No tests/live calls in planning. Planner's initial-clean statement was inaccurate: orchestrator observed existing journal changes, preserved here.
- Resulting state / acceptance: Contract accepted for bounded parallel chat/helper and worker implementation, followed by independent integration testing/evaluation. No runtime fix claimed yet.
- Remaining work and handoff: Implement dynamic source admission, test additions/revocations/blacklist/manual disable/foreign guild and non-Discord grants, review exact map/Calendar provenance, then integrate verified release. General-channel bot destination restrictions remain unchanged.
