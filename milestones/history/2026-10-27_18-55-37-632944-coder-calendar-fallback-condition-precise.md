# Calendar fallback condition qualified precisely

- Local timestamp / acting role / milestone: 2026-10-27T18:55:37.632944-04:00 / coder / prompt-clarification-completion-2026-10-27.
- Requested scope: Tighten prompting for ambiguous Contacts writes and repeated Calendar searches exposed by actual-model verification.
- Starting repository state: dev/tool-api-services02427ba with the local Markdown migration and concurrent operation-API/readback/test work preserved.
- Work performed / changed files: Adjusted the first routing condition to require a ready, complete, empty Calendar read or an unavailable Calendar, matching the later passage and preventing partial-empty results from implying absence.
- Decisions: Prompt wording only; preserve backend checks, tool isolation, schemas, execution bounds and unrelated workflows.
- Checks and evidence: Regenerated final review diff; all87assets and six chat assembly variants pass. No other source changes or inference.
- Resulting state / acceptance: Final wording is ready to freeze.
- Remaining work and handoff: Tester verifies actual clarification, completion and preservation behavior.
