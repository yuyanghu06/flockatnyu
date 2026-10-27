# Missed current-presence investigation — planner

- Local timestamp / role / milestone: 2026-10-27T12:07:59.924491-04:00 / planner / planner-presence-diagnosis.
- Requested scope: Explain why the reported Discord current-location messages did not place the member on the map.
- Starting state: Substantial unrelated working-tree changes and other active milestones were preserved.
- Work and evidence: Read the staged prompt, handler, adapters, Member Plans and Calendar synchronization paths. Independent code review agrees that existing instructions support standalone current presence and do not require association with a club event. Full historical context is only required for a named essential missing fact. An offline building-matcher check confirms bare eLab is unknown while the full saved alias matches; this is a separate latent issue. Existing Member Plans/synchronization checks passed, while a combined focused run reported 15 passes and four unresolved scripted-clock-fixture failures. No actual-model reproduction or application edits occurred. Specialist did not read production audits directly; incident interpretation uses the orchestrator's supplied live findings.
- Changed files: This pass adds only diagnosis tracking; application code and business data remain unchanged.
- Result: Diagnosis accepted; no implemented or deployed fix is claimed.
- Remaining work: If correcting the behavior, reproduce with the configured model and production runner/adapters against simulated services, verify independent presence routing, supported departure/default timing, full building mapping and preserved unrelated data, then review and release within authorized scope.
