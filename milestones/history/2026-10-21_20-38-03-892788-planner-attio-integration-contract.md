# Attio integration contract

- Local timestamp / acting role / milestone: 2026-10-21_20-38-03-892788 / independent planner / attio-integration.
- Requested scope: search/read/create/update Attio CRM records through Flockbot routes and tools; user selected write support explicitly.
- Starting repository state: extensive unrelated pending changes; no existing Attio modules. Preserve all current source and access boundaries.
- Work performed / changed files: read-only inspection of routes, runtime, shared website/Discord runner, context projections, tool adapters, validators, source policy and audit naming. Parent began serialized runtime/route/context wiring after the report; dedicated coder owns only new integration directories.
- Decisions: reuse authenticated POST /api/tools/:tool, source UUID and explicit object allowlist, fixed HTTPS API, opt-in credentials/write flag, shared chat runner. Request-local reads precede chat updates; no autonomous-worker registration, deletion or stored CRM archive. Provider attribute values get recursive bounds. Official Attio documentation verified search/read/create/PATCH append payloads. No atomic concurrency guarantee is claimed.
- Checks and evidence: planner read-only commands only; no tests or external writes. Confirmed explicit adapter propagation in chat-runner.js and bounded result projection are required, along with fixed diagnostic tool names.
- Resulting state / acceptance: planning accepted; implementation underway. Exact credentials/source/object configuration remain operational setup, not inferred access grants.
- Remaining work and handoff: complete new client/tools, independent synthetic route/native/planned chat tests, evaluation, focused repairs and documentation. Parent exclusively owns journal and shared wiring.
