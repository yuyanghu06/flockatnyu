# M20 citation enum — independent tester PASS

- **Milestone / role / scope:** bounded independent provider/runner acceptance. Owned only `tests/discord-summary-provider.test.mjs`, `tests/discord-summaries.test.mjs` and `evidence/citation-enum-*`. No implementation, journal, documentation, cloud, credentials, real model calls or child agents.
- **Starting state / inspected files:** AGENTS.md, milestone/to-do state, report template, parent acceptance criteria, provider/runner/config and tests; final coder contract and immutable migrations001–009. Existing historical evidence was preserved.
- **Work performed:** added ten checks for shared enum scope/limits/accounting, reducer and map packing, singleton compression/stall, cached resumption, and genuine PostgreSQL publication. All Responses requests were mocked; the database fixture used PGlite and the actual nine-migration storage adapter.
- **Decisions / assumptions:** enum scope is the caller's authoritative original citation list, never inferred from untrusted text/author/synthetic IDs. The 512 limit counts unique IDs. Empty scope uses valid zero-finding arrays with no empty enum; an empty response may still be dispatched/accounted. Summarization may select fewer findings, while every input segment and child part must retain complete coverage.

## Executed checks

| Command | Result / evidence |
| --- | --- |
| `node --test tests/discord-summary-provider.test.mjs tests/discord-summaries.test.mjs` | Exit 0; **63/63**, 2.82s. `citation-enum-focused-tests.log`. |
| `node --test --test-skip-pattern='representative108836' tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs` | Exit 0; **243/243**, 19.54s. `citation-enum-integrated-tests.log`. Only the previously accepted, unchanged SQL scale was excluded. |
| `npm run build:api` | Exit 0; API syntax/runtime dependencies verified. `citation-enum-api-build.log`. |
| `git diff --check` | Exit 0. |
| `shasum -a 256 server/discord/summary-provider.js server/discord/summaries.js supabase/migrations/20261012000{6,7,8,9}_*.sql` | Final implementation hashes recorded in `citation-enum-hashes.log`; applied006–009 hashes match prior acceptance. No SQL files changed in this pass. |

## Independently verified behavior

- Actual emitted Responses body contains one shared `$defs.finding` and seven references. Its one enum equals the deduplicated allowed original IDs exactly; author, foreign-context and synthetic input IDs are absent. Existing model, default service tier, strict text schema, reasoning-none, store-false, no tools/images and redirect-error checks remain passing.
- Zero allowed IDs yield seven arrays with `maxItems:0` and no empty enum. Empty arrays are accepted. A mocked API finding outside that scope still fails closed and records observed usage.
- 512 unique 20-digit IDs are accepted even when repeated in the supplied list; their enum strings total 10240 characters, below the assigned 15000-character and 1000-value bounds. 513 unique IDs or malformed/synthetic IDs fail before reservation, fetch or usage commit.
- Reservation estimate covers the entire serialized enum-bearing request plus existing overhead. Adding 512 IDs increases reserved input by more than 10000 bytes/tokens and increases the reserved worst-case cost; evidence-only sizing cannot undercount schema cost.
- A mocked API foreign citation remains unpublishable even with the strict enum, while its valid observed token usage remains charged. Refusal/malformed/incomplete/usage-overflow, retries, aborts and operation/run caps still pass.
- A 65-map fixture carries 780 distinct original citations. Reducer batches split at42/23 map children, consume all 65 children and all 780 citation IDs without clipping, then merge through a third reducer. Every request stays within 512 unique citations, 64 child refs and 48KiB evidence. A 66-request partial run checkpoints maps plus one reducer; resumption handles reordered cached JSON/refs, completes the remaining stages, and a final cached publication uses 0 further dispatches.
- Two individually valid 300-citation children compress a complete singleton before merging, retaining a mixed map/reduce DAG and all 600 original IDs through reducer inputs. Final publication can reuse all four cached stages with0 dispatches. A singleton that shrinks neither citation scope nor content stops with `stalled` after three charged fixture requests, without publication or losing coverage.
- Map packing also respects 512 citations independently of byte limits. A single inherited certificate with 513 citations fails truthfully before any model request/publication; its input list remains intact.
- **Genuine PostgreSQL integration:** 780 original records produce 34 maps and 3 reducers through the actual provider request builder/decoder and real storage RPCs. A transient finish failure leaves all 780 raw records and complete persisted coverage/DAG. The 37 cached stages then publish with0 new model dispatches, exactly 780 represented originals, atomic raw/temp pruning and unchanged 37 receipts/$0.001295 mocked observed cost. No production data was used.

## Findings, limitations and handoff

No material implementation defect remained. Test-only fixture assumptions were corrected: model reducer inputs contain summaries rather than stage metadata, and SQL child lineage uses part UUID foreign keys rather than ordinal columns. Corrections preserved canonical model input, promptv3 and substantive assertions.

**Verdict: PASS for this bounded local change.** Actual OpenAI acceptance/quality, historical bootstrap completion, production costs/pruning, Railway deployment and schedules were not exercised by this tester. The genuine database test used synthetic originals and mocked HTTP Responses. Broader unchanged archive-scale evidence was reused rather than repeated.

Folder-guide and milestone/history updates are orchestrator-owned. Root should journal this pass and combine it with the independent evaluator verdict before resuming the existing operation under its original caps.
