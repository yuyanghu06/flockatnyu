# Save activity-based map label requirement

- Local timestamp / acting role / milestone: 2026-10-17T16:43:09.887284-04:00; orchestrator; map presence labels.
- Requested scope: note that agent labels should describe what the person is doing at the location.
- Starting state: explicit table labels implemented; agent map-write tool remains unexposed. Concurrent startup work preserved.
- Work performed / changed files: saved the dated requirement in notes.md, added a future tool-wiring checklist item and updated the rolling journal. No source/schema/data/runtime edits.
- Decisions: short activity labels must follow supplied context rather than the building alone; unknown activities stay blank. This note does not implement or deploy the agent tool.
- Checks and evidence: inspected notes and current tracking; scoped whitespace check passed. No runtime tests needed for documentation only.
- Resulting state / acceptance: user-requested note persisted.
- Remaining work and handoff: apply this behavior when implementing the map-write tool; unrelated tasks unchanged.
