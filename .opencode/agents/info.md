# OpenCode role agents (Codex mirror)

These Markdown agent definitions mirror the five managed development roles
defined in `.codex/agents/` (orchestrator, planner, coder, tester, evaluator)
for the OpenCode runtime.

- **Source of truth**: `.codex/agents/*.toml`. When a role changes there,
  refresh its mirror here in the same pass and disclose any drift in the pass
  report. Never let the two sides silently diverge.
- **Format mapping**: Codex `developer_instructions` → Markdown body (system
  prompt); `sandbox_mode: read-only` → `edit`/`shell` deny permissions;
  "specialists do not spawn children" → deny-all `subagent` permissions.
- **Models**: no role pins a model or reasoning effort; roles inherit the
  session's model, matching the Codex rule.
- **Subagent catalog**: the orchestrator may launch only the four specialist
  roles plus `explore`. Specialists deny child spawning outright.
- **Coder file fences**: the coder additionally denies edits to
  `milestones/**`, `.codex/**`, and `.opencode/**`; the shared journal is the
  orchestrator's file.
- **Evaluator**: read-only like the planner, but reading shell checks are
  deliberate (`ask`, with no echo of sensitive output). It may not edit or
  request privileged changes.

Use subagents through OpenCode's `subagent` tool with assignments following
`docs/templates/agent-assignment.md`. The `orchestrator` agent is `mode: all`,
so a session may select it as its primary agent; whether future sessions in
this repo default to it remains an open user decision.
