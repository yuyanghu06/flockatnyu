# Planner follow-up verification — October 23, 2026

The worker keeps 16 calls per reply, 64 calls per stage and 10 follow-up model turns. Numbered task references now follow the same current-cycle-first order as the task catalogue. The prompt selects one or two tasks, completes them or establishes a real blocker, then considers more work. This small-group policy is a model instruction; the existing backend limits remain unchanged.

## Compact saved-task reads

`read_pending_task` defaults to `detail:"compact"`. It preserves the complete original inputs, request, source IDs/references, exact timestamps/version and small Calendar routing metadata. Historical context and execution history remain saved unchanged. The model can request `detail:"full"` and use existing lossless fragments when a specific missing fact is needed. Neither read fetches source, Calendar or map content.

A tested 87,804-byte saved task produces a 1,594-byte compact response, about 98% less data. Necessary original text is never silently shortened. Private receipts still bind the complete canonical task snapshot. Compact and full disclosure are tracked separately; an incomplete optional full-history read does not invalidate a completed compact read. Stale task versions and unsuccessful actions cannot resolve work.

## Actual-model checks

Configured `openai-compatible/gpt-6-luna` used the production provider, runner and tool adapters, with simulated source responses and in-memory Calendar/map/task storage. Only the configured inference endpoint was networked. Credentials were loaded privately and excluded from snapshots and evidence.

Initial setup was deterministic and included the separately named simulated sync. Every follow-up response used the actual model. These are follow-up evaluations, not live business-service writes or actual-model initial interpretation.

| Scenario | Observed result |
| --- | --- |
| Current ready task among 121 older tasks | Updated attendance, resolved the exact task and finished in six requests. Older tasks unchanged. Tested before the final narrow prompt corrections. |
| Unmatched current speaker plus a contextual “me” reply | Read actual nearby context, retained the unmatched task, correctly updated/resolved the ready speaker and finished in five requests after correction. |
| Unavailable map state | No write or resolution; retained work and finished in four requests. Tested before the final narrow prompt corrections. |
| Concurrent human edit | Actual first write conflicted; reread the map, retried the same unchanged task with its new parent revision, preserved human facts, resolved and finished in seven requests after correction. |

The first closed gate used 26 of 32 allowed dispatches. It retained two incomplete cases: the peer case applied and resolved its ready work but hit its stricter eight-request test cap before finishing; the conflict case wasted turns rewriting and rereading the same task. Three traces also used an incorrect source UUID before recovering. Narrow prompt corrections put conflict recovery, new-person boundaries and source routing beside task selection.

A fresh failed-case-only gate used 12 of 20 allowed dispatches, five and seven per case. Its ten-request case bound matches the existing production follow-up ceiling. Both corrected cases pass. Total actual inference dispatches were 38, including retained failures. Unused budgets were not transferred between closed gates.

All inspected traces loaded only current tasks, with at most two active tasks and no full-history/fragment reads. The 121 older tasks remained unchanged. Returned responses proposed at most three calls in the first gate and four in the corrected gate. Source pins stayed stable.

The first gate had an ineffective phase-filtered assertion because its fixture referenced an unexported property. Raw returned responses and a separate immutable trace audit independently establish the stated behavior. The corrected gate uses actual phase labels and binding-aware blockers: wrong-source denials, misdirected empty reads and recoverable conflicts cannot free a task slot.

## Independent verification

Seven new behavior checks cover ordering, compact actions, lossless Unicode/full reads, isolation, unavailable data, conflicts, optional history and exact task versions. Existing full-context tests explicitly request full detail while retaining their identity and no-write assertions. The orchestrator's available combined integration run passed 206 checks; the tester's overlapping independent run passed 131. One older private replay lacks its ignored case fixture and is excluded from the passing claim. API and whitespace checks pass.

The independent evaluator accepted integration and worker release after verifying all 144 frozen runtime file hashes and exact saved facts. There are no unresolved material findings. No new tool, hidden service workflow, schema change, model/provider setting or budget change was introduced.

## Release

Railway worker deployment `d56cea87-c123-42ac-b992-9d57418f5680` reports SUCCESS, activated at 6:31:55 PM New York on October 23. Container startup and the normal busy lease state are observed. An ordinary queued run then completes preparation, a model response and a separate source read. A complete organic update cycle has not been used as verification, and no forced business write was performed.

The 60-file package uses released baseline `690d6fc` plus exactly `server/automation/staged-pipeline.js` and `server/automation/prompt.js`. Their hashes match the corrected model-test snapshot. Packaged JavaScript syntax checks passed. Unrelated dirty chat/interface/recovery files, credentials, tests and private evidence were excluded. Web, collectors, schema and environment settings were not changed.

Private detailed traces and package receipts remain ignored under `evidence/planner-followup-focus/`. This document records synthetic outcomes and content-free operational facts only.
