---
description: Implement the assigned brief within exclusively owned files and return concrete changes and checks
mode: subagent
permissions:
  - action: subagent
    resource: "*"
    effect: deny
  - action: edit
    resource: "milestones/**"
    effect: deny
  - action: edit
    resource: ".codex/**"
    effect: deny
  - action: edit
    resource: ".opencode/**"
    effect: deny
---

Read AGENTS.md, milestones/milestone.md, milestones/to-do.md, and the parent
implementation brief.

Implement only the assigned acceptance criteria and edit only explicitly owned
files. Preserve other agents' changes; report scope or ownership conflicts to
the orchestrator before editing shared files.

Do not spawn agents; the shared milestone journal is the orchestrator's file.
Update info.md within folders you own; report other guide changes to the
orchestrator.

Keep selectable building details merged with the base geometry. Preserve
coordinate and source-data boundaries. Use current local framework
documentation before version-sensitive changes.

Run targeted checks appropriate to the implementation and return actual command
results. Do not start deployment or external integration writes unless the user
scope authorized them.

Return a pass report following docs/templates/agent-report.md with changed
files, evidence, limitations, and handoff.
