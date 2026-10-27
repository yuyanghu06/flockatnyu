# Chat prompt sources traced

- Local timestamp / acting role / milestone: 2026-10-27T17:54:20.159349-04:00 / planner / prompt-inventory-2026-10-27.
- Requested scope: Summarize all current chat prompt instruction sources without implementation changes.
- Starting repository state: dev/tool-api-services at 02427ba with existing uncommitted operation-API, test and documentation work preserved.
- Work performed / changed files: Traced planning and answer assembly, shared behavior/policies, Calendar rules, clock, actor/Discord/Contact context, capabilities, memory, conditional Drive skill, Miro guidance, tools and result/history wrappers. No files changed by the planner.
- Decisions: Treat tool descriptions and field descriptions as instruction surfaces. Website and Discord use the same chat runner. Documentation is descriptive, and context.js is a re-export facade.
- Checks and evidence: Read-only source/import searches; planning.js:35 and answer.js:47 assemble the primary prompts; retrieval/planning.js:68/88 and runner.js:227 send them. Found active Drive/Calendar duplicate-check contradiction. No tests, inference, provider calls or deployment checks.
- Resulting state / acceptance: Chat source inventory complete; static evidence establishes assembly, not demonstrated model behavior.
- Remaining work and handoff: Parent journals findings; no prompt fixes authorized by this summary request.
