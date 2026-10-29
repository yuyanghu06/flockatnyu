# Contacts diagnosis handoff complete

- Local timestamp / acting role / milestone: 2026-10-28T21:55:12.867026-04:00 / Orchestrator / contacts-read-incident-2026-10-28.
- Requested scope: Diagnose failed production Contacts reads and explain why paging ten contacts does not guarantee a response below 256 KB.
- Starting repository state: Existing planner release records preserved; read-only production and independent diagnostic passes recorded. No runtime changes in this task.
- Work performed / changed files: Reviewed actual code and safe probe evidence. Orchestrator updated milestone snapshot, to-do and incident folder guide; evaluator remained read-only. No implementation files changed.
- Decisions: Count and total byte limits are independent. Recommend bounded supported-field directory results while preserving native raw storage, human edits and exact version checks. Recommendation is not implementation.
- Checks and evidence: Default list fails HTTP 503 response_too_large; underlying read succeeds HTTP 200 at 291,451 bytes across eleven rows for limit ten. Limit five returns 277,472 bytes across six rows and fails the application cap too. Limit one and the two largest sampled exact reads succeed. Independent eight-request script exits zero. git diff --check passes; no model or business write, schema/configuration/deployment change occurred.
- Resulting state / acceptance: Completed requested diagnosis and answered why ten records can exceed 256 KB. Inspected independent evidence and source; preserved existing work. No implementation or production change. Diagnosis complete; incident repair remains unimplemented.
- Remaining work and handoff: Other pages/profiles, historical onset and import provenance were not investigated. A later selected repair needs large-record paging/sorting/filtering and preservation tests, browser evidence and separate reviewed production verification. Existing spending follow-up and other unfinished work are unchanged.
