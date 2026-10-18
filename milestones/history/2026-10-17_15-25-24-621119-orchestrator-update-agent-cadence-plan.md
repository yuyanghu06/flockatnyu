# Update agent cadence plan

- Local timestamp / acting role / milestone: 2026-10-17T15:25:24.621119-04:00 / orchestrator planning / update-agent-cadence.
- Requested scope: Increase trigger to30messages/emails or30minutes, retaining1minute gap. Clarified combined Discord/Gmail queue; Miro is a separate paused collector, not a second AI agent.
- Starting repository state: Concurrent asset relocation and prior naming/status docs present; preserved.
- Work performed / changed files: Inspected config, claim SQL, runtime and existing tests. Assigned exclusive config/example/module guide to coder and two test files to independent tester; primary owns current shared guides/notes/journal. Created milestone folder guide and this record.
- Decisions: minEvents30; maxAgeSeconds1800; cooldown60 and poll5000 unchanged. Max claim20 remains a separate safety bound. No SQL migration or hosted configuration change needed for these supported parameters. Preserve applied SQL and historical5/300fixtures.
- Checks and evidence: Config currently5/300/60; migration019 accepts event threshold1–100 and age1–86400. Claim parameters are supplied from config. No runtime tests claimed for planning.
- Resulting state / acceptance: Bounded implementation brief accepted; independent verification assigned.
- Remaining work and handoff: Review coder/test reports, evaluate and record final acceptance; do not activate worker or modify unrelated assets.
