# Chat agent and update agent terminology

- Local timestamp / acting role / milestone: 2026-10-17T15:21:42.413630-04:00 / orchestrator / post-M39 naming.
- Requested scope: Rename the frontend agent to chat agent and the backend autonomous agent to update agent.
- Starting repository state: Prior status and concurrent asset-advisory journal changes present; preserved.
- Work performed / changed files: Saved naming in notes.md; updated current architecture, agent/backend/folder guides, handoff and rolling milestone/to-do. Added this immutable history entry.
- Decisions: Chat agent names the conversational assistant served by the Chat API; update agent names the autonomous processor run by the automation worker. Runtime identifiers, commands, environment keys, schemas and immutable history retain their existing names.
- Checks and evidence: Inspected active terminology and reviewed documentation diff; git diff --check. No product source changed; runtime tests unnecessary.
- Resulting state / acceptance: User terminology is persisted in current project documentation; runtime/deployment status remains as recorded.
- Remaining work and handoff: Use chat agent/update agent in future discussion and implementation docs; existing MVP action, memory, wiring and deployment work remains open.
