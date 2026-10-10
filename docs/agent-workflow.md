# Managed development workflow

The user gives the primary orchestrator a goal. It selects a bounded milestone,
reads current state, assigns specialists, verifies their results, and keeps the
journal current. Routine iteration continues within that authorized scope.

| Role | Responsibility | File ownership |
| --- | --- | --- |
| Orchestrator | Scope, assignments, dependencies, integration, journal | Shared tracking and explicitly integrated files |
| Planner | Evidence, implementation brief, acceptance criteria | Read-only report returned to orchestrator |
| Coder | Implementation and targeted checks | Assigned implementation files and owned folder guides |
| Tester | Independent checks, useful tests, reproducible failures | Assigned tests and evidence |
| Evaluator | Requirement and evidence review; accept or request fixes | Read-only report returned to orchestrator |

Use plan → implement → test → evaluate → focused fixes/retests → integrate.
Keep at most three specialists active alongside the primary. Reuse idle agents
where appropriate; dependency stages are sequential. Specialists do not spawn
children. Do not have two writers edit the same files concurrently.

Use [assignment](templates/agent-assignment.md) and
[report](templates/agent-report.md) templates. Give the agent its named role config
from `.codex/agents/`, or its equivalent instructions when runtime tools only accept
plain-text assignments. Do not claim native config discovery in a runtime that
does not expose it. Without delegation tools, run roles sequentially and state
that the checks lacked independent agents.

After every pass, the orchestrator inspects actual files and evidence, updates
`milestones/milestone.md` and `milestones/to-do.md`, appends a timestamped entry
using [history-entry](templates/history-entry.md), and refreshes affected folder
guides. Only then is the pass accepted as complete. This serialized ownership
prevents journal races and applies even to read-only planning or review passes.

Complete a milestone when its actual acceptance criteria pass, findings are
resolved, and documentation includes remaining limitations and the next action.
For the future map, build checks must be complemented by browser/visual evidence.
Do not invent app commands before a toolchain exists. This workflow does not
create an unattended scheduler or the future product assistant.

The project-local configs use the standalone custom-agent format documented in
[official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
No model choices, global settings, or MCP entries are changed by this setup.
