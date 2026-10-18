# Chat orchestration coder integrated

- Local timestamp / acting role / milestone: 2026-10-18T19:03:12.090909-04:00 / coder, orchestrator integration / chat production fixes.
- Requested scope: report retries and named attendance; preserve source gates, memory and attachment intent isolation.
- Work performed / changed files: server/assistant-context.js once-per-message guard/tool removal, safe attendance targets and applied receipts, routing and answer prompts; server/map/chat-intent.js conservative declaration parser and quote/fence stripping; bug tool description; bug and new orchestration tests. Parent refreshed applicable guides/runtime integration.
- Decisions: one report attempt including failure; no extra progress row for rewritten retries. Unique named attendance is a narrow separate capability; generic map writes still need current original-provider evidence. Upload contents are untrusted context.
- Checks and evidence: coder66/66 across bug/orchestration/chat policy/memory/assistant/provider/context/calendar tests, syntax and owned whitespace passed. Parent14/14 focused orchestration/source checks and18 attendance checks passed at intermediate revisions; final independent verification pending.
- Resulting state: coder files integrated; independent tester reviewing. No production mutation/deployment by this pass.
- Remaining work: complete attendance/upload implementation reports, independent acceptance, full regression/build and isolated live verification.
