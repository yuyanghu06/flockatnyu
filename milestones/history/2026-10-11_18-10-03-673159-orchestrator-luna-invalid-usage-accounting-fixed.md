# M20 invalid model usage accounting fixed

- Local timestamp / acting role / milestone: 2026-10-11T18:10:03.673159-04:00 / orchestrator / M20.
- Requested scope: Resolve independent provider accounting regression before actual model calls.
- Starting repository state: Runner coder complete; independent tester strengthened excess-output usage assertion and found invalidactual usage passed to durable accounting.
- Work performed / changed files: Root assumed summary-provider.js fix ownership after coder finished. Usage exceeding predispatch input/output/cost reservation now clears usage and records an unknown dispatch charge; it remains unpublishable. docs/discord-archive.md also refreshed to remove superseded manual-thread/vector/summaries-deferred claims.
- Decisions: Invalid provider accounting cannot reduce or invalidate the durable conservative reservation. Preserve unknown spend and fail closed.
- Checks and evidence: node --test tests/discord-summary-provider.test.mjs19/19 passed including output1601 against1600 reservation, requiring unknown/null usage. No network/model calls.
- Resulting state / acceptance: Targeted provider fix passed; integrated SQL/scale/evaluator acceptance remains pending.
- Remaining work and handoff: Tester proceeds with latest provider and six-migration coverage; evaluator includes fix. Actualpilot/all-manifest generation remains afteracceptance.
