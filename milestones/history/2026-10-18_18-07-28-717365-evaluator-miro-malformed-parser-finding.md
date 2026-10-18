# Miro malformed parser finding

- Local timestamp / acting role / milestone: 2026-10-18T18:07:28.717365-04:00 / evaluator / live worker recovery.
- Requested scope: recover authorized Discord/Calendar work during optional Miro navigation outage without false evidence, broader access or complete-sync claims.
- Starting repository state: web and catalogue restored; official Miro overview/current-month search return tool_result_error with source checks valid. Existing worker hardfails preparation.
- Work performed / changed files: Independent actual-parser/handler review found malformed JSON and nonarray content were normalized to generic unavailable; this would wrongly defer malformed content. Required classify malformed envelopes/JSON invalid_mcp_result while preserving real upstream isError tool_result_error. Runtime adapters/prompt/handler and new outage tests; parser fix limited tools/miro/mcp.js. Legacy test update separately scoped.
- Decisions: only recognized navigation outages defer; all authorization/config/malformed failures remain fatal. Calendar original-read/projection finish gates preserved. No live source mutations or model calls in coder/evaluator checks.
- Checks and evidence: Actual handler malformedJSON initially completed unrelated Calendar map work, contrary to required malformed failclosed policy; no Miro evidence/write-authority leak. Source acceptance withheld. Model diagnostic interrupted before changing monitored source.
- Resulting state / acceptance: see current rolling snapshot; final parser-corrected independent review/model acceptance pending.
- Remaining work and handoff: final full regression/API build, independent review, same-five actual-model scenarios on stable final hashes, sanitized worker deployment and actual completed batch verification.
