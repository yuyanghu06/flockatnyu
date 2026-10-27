# Completed real-model verification accepted with unresolved behavior failures

- Local timestamp / acting role / milestone: 2026-10-27T18:40:14.997564-04:00 / evaluator / prompt-markdown-live-2026-10-27.
- Requested scope: Verify the migrated Markdown prompts with the configured live LLM through production chat/update runners and simulated business services.
- Starting repository state: dev/tool-api-services02427ba with completed local prompt migration and concurrent operation-API/readback/testing work preserved.
- Work performed / changed files: Read both immutable request ledgers, frozen driver/fences, actual model proposals, tool outcomes, exact saved states/mutation arguments and final replies. No evaluator edits or inference calls.
- Decisions: Keep prompts and runtime logic unchanged; inference only, simulated business data and writes.
- Checks and evidence: Independently confirmed unavailable and conflict passes, cumulative50 requests, primary configured model/HTTP200, stable 396-file freezes/all87assets and unchanged common production hashes. Confirmed first-batch ambiguity and Calendar-repetition failures; raw assertion mismatches are distinct from model errors.
- Resulting state / acceptance: ACCEPT completed verification; REQUEST CHANGES for full behavioral acceptance. Six semantic passes and two actual failures are supported.
- Remaining work and handoff: Report failures honestly and leave real-service/deployment task rows unchanged; selected behavior fixes need separate verification.
