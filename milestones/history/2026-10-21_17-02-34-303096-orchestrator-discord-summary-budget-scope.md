# Discord summary aggregate budget clarified

- Local timestamp / acting role / milestone: 2026-10-21T17:02:34.303096-04:00 / orchestrator / tool failure diagnostics.
- Requested scope: explain whether read_discord_summary runs per channel and recommend whether its 120-second budget should increase.
- Starting repository state: extensive existing local and concurrent changes preserved; recent diagnostics release remains undeployed.
- Work performed / changed files: read-only inspection of tools/discord/live-summary.js and live retrieval/configuration; journal only.
- Decisions: broad summary shares 120 seconds across catalogue discovery and sequential channel reads/summarization. Default scope is authorized eboard; exact requested team channel bypasses the broad aggregation timer and uses its ordinary window deadline. Recommend a five-minute broad ceiling with parent-budget answer reserve and bounded concurrency respecting Discord pacing; no implementation authorized by this advice question.
- Checks and evidence: current source and earlier live probe (7 of 11 channels completed before the aggregate timeout). Website default overall request is five minutes; local Discord overall request is twenty minutes, so raising only the nested summary timeout cannot establish a longer effective website scan. Existing coverage/output/model-call bounds remain.
- Resulting state / acceptance: scope and recommendation established; no runtime edits or new live calls.
- Remaining work and handoff: implement and verify a coordinated budget/concurrency change if requested; current runtime remains unchanged.
