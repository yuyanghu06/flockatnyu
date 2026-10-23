# Development roles

Each TOML file defines one named Codex custom agent with its own instructions:
`orchestrator` coordinates and integrates; `planner` produces implementation
briefs; `coder` implements owned files; `tester` verifies behavior and owns tests;
`evaluator` reviews acceptance and evidence. Planner and evaluator have read-only
instructions and sandbox defaults; live parent permission settings can take
precedence. Other roles inherit session permissions. No project role pins a model
or reasoning effort; explicit spawn settings and any user-configured agent defaults
resolve before falling back to the parent's values.

The orchestrator dispatches bounded assignments using `docs/templates/` and
serializes journal writes. Specialists return reports and do not spawn children.

These TOML role definitions are the source of truth for the five-role workflow.
The OpenCode runtime mirrors them as Markdown agents in `.opencode/agents/`
(documented there); refresh that mirror in the same pass whenever a role here
changes. No model or reasoning effort is pinned on either side.
