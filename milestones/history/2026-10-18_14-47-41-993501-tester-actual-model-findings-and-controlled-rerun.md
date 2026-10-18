# Actual-model findings and final controlled rerun

- Local timestamp / acting role / milestone: 2026-10-18T14:47:41.993501-04:00 / tester / agent-prompts.
- Requested scope: implement and test the user's chat/autonomous planner behavior.
- Starting repository state: shared dirty checkout with unrelated authorized map/Miro work preserved; initial local review accepted but real-model findings remained.
- Work performed / changed files: scripts/verify-agent-prompts.mjs and evidence/agent-prompts/live-model-results.json.
- Decisions: Behavior tests exercise real chat orchestration and worker adapters using the configured model with synthetic source data and inert write stores. Per-case hashes, run identity, default budgets and previous runs distinguish stale evidence from final acceptance. Positive evidence assertions check current-day team content and active timing, not merely tool selection.
- Checks and evidence: Prior runs established broad/empty eboard routing, explicit team content, Calendar-primary and empty/unavailable Miro fallback. They exposed source identity, duplicate writes, unknown presence timing, worker premature finish and opaque Calendar URL copying. Final focused and full stable-build runs are in progress; acceptance is not yet claimed.
- Resulting state / acceptance: local fixes implemented; final model acceptance remains pending. No worker activation, deployment or real Calendar/map event writes.
- Remaining work and handoff: complete configured-model reruns, full regression/build checks and independent final review; record exact limits.
