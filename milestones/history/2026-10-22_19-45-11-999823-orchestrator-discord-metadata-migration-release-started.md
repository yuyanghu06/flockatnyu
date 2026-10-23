# Discord metadata migration applied and collector release started

- Local timestamp / acting role / milestone: 2026-10-22T19:45:11.999823-04:00 / orchestrator / live-planner-calendar-tests.
- Requested scope: deploy independently accepted discovery repair and resume natural live tests.
- Starting state: frozen runtime/044 accepted by tester/evaluator. Existing synthetic map/cache/obsolete job cleanup verified; fresh originals pending.
- Work performed / changed files: applied reviewed migration044 via authenticated Supabase MCP (success). Hosted pg_proc checks confirm both RPCs SECURITY INVOKER, fixed empty search_path, service_role execution only, no anon/authenticated execution. Prepared sanitized26-module collector context and byte-matched every source hash; no settings/budgets changed. Uploaded collector-only Railway deployment974cb14c-60ef-43bc-a2fe-9d2e06ee092f, currently INITIALIZING. Web/worker/Gmail not deployed by this pass.
- Decisions/evidence: actual bot permission read for replacement channel succeeded in2442ms; prior read denial was catalogue publication, not demonstrated missing bot membership. Initial advisories read before DDL; unrelated pre-existing advisories not modified. No direct DB credentials fallback or source-history import.
- Resulting state / acceptance: hosted migration verified; deployment accepted but health/replay/live ingestion not yet established. No natural Calendar/map result claimed.
- Remaining work and handoff: verify release startup/health, native originals and exact source scope, then scoped planner execution, natural correction/uncertainty/cancellation and exact final cleanup.
