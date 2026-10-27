# Selected prompt corrections tested with actual model

- Local timestamp / acting role / milestone: 2026-10-27T19:04:41.667181-04:00 / tester / prompt-clarification-completion-2026-10-27.
- Requested scope: Tighten prompting for ambiguous Contacts writes and repeated Calendar searches exposed by actual-model verification.
- Starting repository state: dev/tool-api-services02427ba with the local Markdown migration and concurrent operation-API/readback/test work preserved.
- Work performed / changed files: Ran eight case-groups through production chat/adapters with simulated Contacts/Calendar and native mocked Miro, including actual two-turn clarification and independent exact-field/coverage checks. Retained raw assertions and complete model/state evidence.
- Decisions: Prompt wording only; preserve backend checks, tool isolation, schemas, execution bounds and unrelated workflows.
- Checks and evidence: 40new gpt-6-luna HTTP requests, all HTTP200, maximumgroup9/10 and no cap/networkblocks.397frozen files/all87Markdown assets stayed stable; workspace drift empty. Both original failure reproductions pass. Six strict groups pass, while broader empty lookup and an extra partial probe require semantic qualification.
- Resulting state / acceptance: Actual-model execution complete with original evidence preserved; no source/fixture/prompt edits during inference.
- Remaining work and handoff: Independent evaluator inspects target choice, saved fields, interval union, citations and final replies.
