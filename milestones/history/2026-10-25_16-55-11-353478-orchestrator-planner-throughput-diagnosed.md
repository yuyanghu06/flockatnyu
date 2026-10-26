# Two-input cap and throughput bottlenecks diagnosed

- Local timestamp / acting role / milestone: 2026-10-25_16-55-11-353478 America/New_York / orchestrator / planner-throughput-2026-10-25.
- Requested scope: diagnose two-input batches and slow current planner throughput.
- Work, checks and evidence: User asked why only2inputs/batch and what slows it. Primary read safe selected live config, complete bounded Railway logs and operational metadata, then integrated independent researcher/tester/evaluator evidence. No model/source-content calls, runtime/schema/config/queue/business mutations, restart or deployment. LiveOAuthvariablesare names-only; authenticated CLI capture privately filtered exact nonsecret values. Proven issues: old hard2cap, expensive serial Discord reads/multiple modelturns, repeated follow-up and renewed task-save failures. Recommendations remain unimplemented. Concurrent frontend/map changes preserved;shared journal/folder guides updated.
- Result and handoff: bounded diagnosis accepted; see ../planner-throughput-2026-10-25/info.md. No implementation or tuning performed.
