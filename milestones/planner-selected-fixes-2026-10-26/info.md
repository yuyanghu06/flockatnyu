# Selected planner fixes

Goal: implement the four remedies the user selected after the twelve-hour failure diagnosis.

Status: selected local implementation complete; independent evaluator ACCEPT. Final focused integration and API checks pass. No deployment or live fix is claimed.

Scope:

- Remove unused model-visible log bodies while retaining current task intent, source/target facts, versions, valid tool pairs and private execution/audit evidence. Preserve the existing conversation-size limit.
- Accept distinct completed, no_change_needed and source_missing task resolutions. A no-change result is a reviewed decision rather than a claimed write. Missing originals require a current authorized exact-message absence result bound to the exact trusted original; unrelated or failed reads cannot delete work.
- Improve canonical source/author/Calendar-target hints and prompt instructions without extra hidden reads or weakened permissions.
- Acknowledge exact missing queued originals and delete only eligible current saved task versions through normal explicit bookkeeping.

Held work: reproduce invented page IDs without fixing the reader/schema. Explain the fixed-cutoff/index-friendly old-log cleanup proposal without changing its implementation. No schema, timeout/call/model-round limits, provider, deployment or unrelated logging changes.

Ownership: outcomes coder owns staged-pipeline.js, adapters.js, Discord live-retrieval.js and tool descriptions plus a small outcome helper. Context coder owns handler.js, observation-handoff.js and a new pure conversation helper, including missingInputIds handler wiring. Primary owns prompt.js, instructions/docs and journal. Tester owns new targeted tests/model harness/private evidence. No specialist spawns agents.

Acceptance: both old accumulated-text paths handled without dropping necessary state; reviewed already-correct and nonactionable tasks close without writes; exact missing originals clear only their own input/task; denied/unavailable/incidental404/newer-version/mixed-original cases preserve work; tool pairing/current evidence/human edits/automatic separate finish sync remain; held behavior remains. Independent real-model tests use production runner/adapters with simulated source/storage, inference-only networking and at most48actualHTTPrequests including retries. Actual-model and offline results, including their limits, are recorded below.

Baseline: node --test tests/agent-staged-handler.test.mjs tests/staged-pipeline.test.mjs tests/staged-runtime-integration.test.mjs passed159/159 before changes.

Design references: [LangChain context editing](https://github.com/langchain-ai/langchain/blob/master/libs/langchain_v1/langchain/agents/middleware/context_editing.py), [PydanticAI history processing](https://github.com/pydantic/pydantic-ai/blob/main/docs/message-history.md). Both MIT; no new framework dependencies or copied code.

[Research](../history/2026-10-26_13-27-27-712458-researcher-planner-conversation-compaction-design-researched.md) · [Accepted plan](../history/2026-10-26_13-27-27-712766-planner-planner-selected-fixes-contract-accepted.md)

Implementation checks: existing outcomes suites passed 212 checks, with a final 164-check focused rerun. Handler checks passed 19. The two previous conversation-overflow paths now stay below the unchanged limit in simulated production-runner checks. Root API build passes. The first independent behavior checks passed; the completed actual-model evidence and final verification below supersede this interim count.

[Implementation receipt 1](../history/2026-10-26_13-37-55-406074-coder-planner-selected-outcomes-implemented.md) · [Implementation receipt 2](../history/2026-10-26_13-37-55-406983-coder-planner-active-conversation-trimming-implemented.md) · [Implementation receipt 3](../history/2026-10-26_13-37-55-407250-orchestrator-planner-selected-prompt-and-hints-integrated.md)

## First actual-model pass and correction

The first five complete conversations used 46 of the 48 permitted HTTP requests with GPT-6 Luna. Exact missing-original cleanup passed without business writes. Denied-source preservation passed but follow-up hit its turn cap. The Calendar-backed update preserved human/legacy facts, but an extra task remained after a cap, so this was partial success. Already-correct and nonactionable saved work did not close correctly; independent evaluation requested changes. The held page-ID bug was reproduced by the actual model on a complete 764-byte source response.

The corrected revision makes a verified unchanged attendance operation an explicit successful no-change result with copyable task-resolution hints. It also formats the correct initial saved-task completion arguments and limits initial no-change choices to backend-eligible originals. Final verification used only the two remaining actual-model requests for targeted decisions with production-generated current evidence, recorded/scripted setup and local completion. Those checks do not establish that fresh complete conversations all pass; the original failures and partial outcomes remain recorded. No request cap is raised or reset.

The broader isolation test selection has 27 failures that reproduce identically against clean pre-change HEAD. They are older fixture failures and remain unfixed, separate from the clean 159-test staged baseline and the selected behavioral checks.

[Verification/correction receipt 1](../history/2026-10-26_13-49-09-837091-tester-planner-real-model-first-pass-failures-found.md) · [Verification/correction receipt 2](../history/2026-10-26_13-49-09-837384-evaluator-planner-first-revision-changes-requested.md) · [Verification/correction receipt 3](../history/2026-10-26_13-49-09-837488-coder-planner-no-change-results-and-wire-hints-refined.md)

## Held behavior and proposed cleanup

The actual model reproduced the held page-ID failure: it received a complete 764-byte Discord response with no fragment, then tried to continue it using the queued input UUID. No such continuation existed, so the unchanged reader rejected it. This is separate from the selected input/output hint improvements; no continuation-ID repair was implemented.

For old-log cleanup, the proposed correction is to capture one fixed expiry cutoff, let the existing expiry index find old rows directly, keep the existing small deletion batches and seven-day retention, and emit only safe timeout/database/HTTP reason codes if it fails. Measure the corrected query before considering any timeout change. This proposal is documentation only: cleanup code, SQL and runtime settings are unchanged.

## Final review found a target-freshness gap

The latest review reproduced a selected-scope bug: a successful read of task A's event, followed by an unavailable read of A, then a successful unrelated event B read could make A's older state count as already correct. The global latest-state guard was insufficient. Validation now uses the latest matching target read itself for both proof and freshness. Independent regression checks reproduce the previous deletion bug, preserve the task after correction, and allow exact-target recovery. No additional model requests are made; the shared ledger has used all 48.

## Corrected decision checks and final backend replay

The last two permitted actual-model requests chose the correct no-change decisions and closed exact tasks without business writes. These used production-generated current evidence with scripted preparation and local finish; they were not fresh full conversations. All 48 actual HTTP requests have now been used.

After the final matching-target correction, the independent Tester passed 100 focused checks and replayed those two recorded model choices through the corrected backend with current reference rebinding. This replay used no inference. Prompt behavior was verified before this last backend-only guard change; the actual API run and final offline replay are distinct evidence. Final integrated checks and independent evaluator recheck passed, with the model limitations retained.

[Verification receipt 1](../history/2026-10-26_13-58-53-438400-tester-planner-corrected-no-change-decisions-verified.md) · [Verification receipt 2](../history/2026-10-26_13-58-53-438710-evaluator-planner-target-freshness-changes-requested.md) · [Verification receipt 3](../history/2026-10-26_13-58-53-438811-coder-planner-matching-target-freshness-corrected.md) · [Verification receipt 4](../history/2026-10-26_13-58-53-438892-tester-planner-final-target-freshness-and-model-replay-verified.md)

## Final local acceptance

The final focused integration run passed 270 checks, and the API syntax/runtime dependency build and whitespace checks passed. Independent Tester and Evaluator accepted the selected local changes. The target-freshness correction is covered by two negative forms, successful exact-target recovery and replay of both recorded model decisions.

The inference ledger remains exactly 48 of 48 requests. Two corrected no-change decisions passed with the configured model; their setup and local finish were scripted. The original five full conversations were not rerun. Their earlier failures, held page-ID behavior, capped runs and leftover-task findings remain part of the report. The final backend guard was verified offline rather than with new inference. Twenty-seven unrelated older isolation fixture failures reproduce against clean pre-change HEAD and remain unchanged.

No live deployment, sustained queue performance or business-service result is claimed. All held reader, audit cleanup, SQL and diagnostic implementation hashes match the recorded pre-change files. No dependencies or schema changes were added.

[Final evaluator acceptance](../history/2026-10-26_14-00-22-456674-evaluator-planner-selected-local-fixes-accepted.md) · [Integrated local result](../history/2026-10-26_14-00-22-457003-orchestrator-planner-selected-fixes-integrated-locally.md)
