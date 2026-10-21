# Local harness inventory for Morpheus comparison

- Local timestamp / acting role / milestone: 2026-10-21T12:42:36.361369-04:00 / planner / Morpheus harness research.
- Requested scope: read-only comparison of reusable harness patterns; no implementation request.
- Starting repository state: dirty tree with concurrent chat-budget and collector-diagnostics work, preserved.
- Work performed: independent planner inspected chat runner/context/provider, Discord adapter/bridge, automation handler/store and migrations. No specialist file edits.
- Decisions: native tool continuation, scoped tools/memory, model audit, leased batches and deterministic Calendar writes already exist. Worker failed inputs already defer five minutes; missing bounded attempts/quarantine is the narrower fairness opportunity. Discord adapter uses global/per-user caps and returns busy; no channel-key queue. Provider has no transient retry wrapper.
- Checks and evidence: static cat/sed/rg inspection; server/discord/chat-adapter.js:51-58,98; server/discord/chat-bridge.js; server/providers/index.js; server/automation/handler.js; supabase/migrations/202610170019_agent_automation_state.sql:113-127; supabase/migrations/202610180032_scoped_agent_claim.sql. No tests, model calls or hosted checks run.
- Resulting state / acceptance: inventory accepted for advisory comparison; no application changes.
- Remaining work and handoff: orchestrator compares pinned Morpheus source and records recommendations without authorizing implementation or deployment.
