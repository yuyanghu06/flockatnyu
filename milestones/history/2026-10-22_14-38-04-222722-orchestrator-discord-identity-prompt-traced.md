# Discord identity prompt path traced

- Local timestamp / acting role / milestone: 2026-10-22T14:38:04.222722-04:00 / orchestrator / identity-context clarification.
- Requested scope: Determine whether Discord bot receives the roster mapping automatically, prompted by a screenshot of a failed map-profile match.
- Starting repository state: Existing unrelated changes preserved; prior exact live username lookup completed.
- Work performed / changed files: Traced runtime-app context loader, directory read, bridge runner arguments and both assistant prompt builders. Journal files only changed.
- Decisions: Automatic directory contains Discord user IDs and roster display labels; current actor context separately contains user ID, username and display name. Neither replaces the exact source-backed map-person lookup required for writes.
- Checks and evidence: Direct current directory read returned complete=true, 27 rows, actorMapped=true. Prompt serialization includes the actor ID. No model call, source write, database mutation, Discord send or deployment. This checks current configured directory and code wiring, not the exact historical prompt/tool outcomes in the screenshot.
- Resulting state / acceptance: Automatic injection confirmed in current implementation; screenshot alone cannot establish the cause of the failed lookup or unintended bug report.
- Remaining work and handoff: Historical tool outcome investigation would be a separate diagnostic step. No fix requested or performed.
