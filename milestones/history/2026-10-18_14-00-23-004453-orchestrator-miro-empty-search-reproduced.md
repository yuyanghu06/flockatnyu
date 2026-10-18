# Miro empty date search reproduced

- Local timestamp / role: 2026-10-18T14:00:23.004453-04:00 / orchestrator.
- Requested scope: investigate repeated Miro failure and possible stale local tab.
- Starting state: shared MCP cutover, concurrent edits preserved.

The repeated screenshot established that prior successful requests did not prove the failing date-search path worked. Fresh live MCP probes for ISO date text, long-form date text and relative-week text returned total_items=1226,total_results=0 with results omitted. Our wrapper required results to be an array and incorrectly classified this legitimate empty response as invalid_mcp_result. This is a concrete reproducible parser bug; it does not establish token expiry or an outdated frontend.

The user’s existing Chrome tab was verified at http://127.0.0.1:5173/. It was refreshed and the same today question was submitted through the UI. That variation successfully reached actual calendar content, demonstrating query-dependent behavior rather than proving the screenshot obsolete. Coder owns only reader and both agent prompts; independent tester owns empty-search/continuation/orchestration regressions. Fix must treat empty search as navigation, never absence evidence, and continue to actual month calendar cells within the existing four-call budget. No source data, schema, credentials or service settings changed during investigation. Private original source responses remain temporary only.
- Acceptance: root cause reproduced; implementation and independent regression acceptance pending.
