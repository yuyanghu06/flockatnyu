# Miro parser malformed results failclosed

- Local timestamp / acting role / milestone: 2026-10-18T18:07:28.717495-04:00 / coder / live worker recovery.
- Requested scope: recover authorized Discord/Calendar work during optional Miro navigation outage without false evidence, broader access or complete-sync claims.
- Starting repository state: web and catalogue restored; official Miro overview/current-month search return tool_result_error with source checks valid. Existing worker hardfails preparation.
- Work performed / changed files: After model stop, unpack validates result envelope/content and parses only object JSON; malformed cases map invalid_mcp_result, explicit upstreamisError remains tool_result_error. Existing transport catch unchanged. Runtime adapters/prompt/handler and new outage tests; parser fix limited tools/miro/mcp.js. Legacy test update separately scoped.
- Decisions: only recognized navigation outages defer; all authorization/config/malformed failures remain fatal. Calendar original-read/projection finish gates preserved. No live source mutations or model calls in coder/evaluator checks.
- Checks and evidence: 97/97focused checks, syntax/whitespace pass. Nine actualparser/handler malformed shapes produce zero model calls/mapwrites/Calendarwrites/completions. Final sources frozen for independent review and fresh model run.
- Resulting state / acceptance: see current rolling snapshot; final parser-corrected independent review/model acceptance pending.
- Remaining work and handoff: final full regression/API build, independent review, same-five actual-model scenarios on stable final hashes, sanitized worker deployment and actual completed batch verification.
