# User timezone backend implementation

- Local timestamp / acting role / milestone: 2026-10-15_21-12-51-065825; coder; M32.
- Requested scope: API context and shared Discord calendar conversion.
- Starting repository state: dirty shared workspace and accepted M32 contract; browser transport implemented separately.
- Work performed / changed files: server/time-zone.js, server/app.js, server/assistant-context.js, server/live-retrieval-tools.js, server/discord/live-chat-summary.js and server/info.md. Root inspected actual resulting files before accepting the pass.
- Decisions: canonical IANA timezone; explicit UTC compatibility default; one server clock, separate from authorization; strict date-only/relative dates; preserve explicit offset instants; first valid local-day boundary; shared generic/RAM normalization and coverage.
- Checks and evidence: coder API build, syntax, whitespace and deterministic boundary checks passed (New York, Lord Howe, Los Angeles, India/Nepal, midnight gap and skipped day). Initial existing regression subset71/72 passed; the obsolete date-only rejection is assigned to tester. Root build/API and whitespace checks independently passed. Independent evaluator initially passed94 current tests; final review is pending tester report.
- Resulting state / acceptance: implementation pass accepted; M32 final acceptance pending independent evidence. No SQL, scheduler, cloud, model or auth changes.
- Remaining work and handoff: finish expanded independent tests and review, then integrate final current state.
