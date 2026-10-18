# Worker Calendar completion and exact URL correction

- Local timestamp / acting role / milestone: 2026-10-18T14:47:41.989293-04:00 / coder / agent-prompts.
- Requested scope: implement and test the user's chat/autonomous planner behavior.
- Starting repository state: shared dirty checkout with unrelated authorized map/Miro work preserved; initial local review accepted but real-model findings remained.
- Work performed / changed files: server/automation/adapters.js, handler.js, config.js, prompt.js and assigned Calendar/automation tests.
- Decisions: Default budget is 12 rounds/24 calls/90 seconds. A deterministic completion fence requires complete bounded Calendar coverage and observed occurrence projection; after Calendar writes, reread the returned event. Malformed opaque Calendar URLs receive narrowly verified canonical-link feedback before any write; wrong source, unknown event and revoked access fail closed.
- Checks and evidence: Specialist reported 110 focused checks passing; parent inspected implementation and actual-model failure traces. Real-model Miro pipeline rerun remains pending.
- Resulting state / acceptance: local fixes implemented; final model acceptance remains pending. No worker activation, deployment or real Calendar/map event writes.
- Remaining work and handoff: complete configured-model reruns, full regression/build checks and independent final review; record exact limits.
