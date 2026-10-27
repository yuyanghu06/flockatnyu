# Current chat and update-agent prompt inventory completed

- Local timestamp / acting role / milestone: 2026-10-27T17:54:20.159352-04:00 / orchestrator / prompt-inventory-2026-10-27.
- Requested scope: Answer where chat and update-agent prompting currently lives and what each layer controls.
- Starting repository state: dev/tool-api-services at 02427ba with existing uncommitted operation-API, test and documentation work preserved.
- Work performed / changed files: Inspected current branch, dirty state, source call sites and three read-only specialist reports. Recorded the inventory in the milestone folder and updated rolling status, to-do and folder guides; created immutable per-pass histories. No application/prompt source changes.
- Decisions: Use current dev/tool-api-services checkout as the source of truth. Cover chat tool selection/final reply, update initial/follow-up/legacy, policy fragments, injected context/skills, tool/schema wording, recovery feedback and Discord summary prompt. Keep prior unresolved work intact.
- Checks and evidence: Source-only inspection identifies all direct model request paths in chat retrieval, chat runner, automation handler and Discord summary provider. Evaluator ACCEPT. No tests, actual-model evaluation, provider reads, business writes, deployment, commit or push.
- Resulting state / acceptance: Requested inventory complete and independently reviewed. Known active Calendar/Drive duplicate-check contradiction remains unchanged. Deployment parity and actual prompt behavior were not verified.
- Remaining work and handoff: Deliver source map. Any wording cleanup or behavior verification needs its own requested pass; existing planner preservation and Calendar/Member Plans verification limits remain open.
