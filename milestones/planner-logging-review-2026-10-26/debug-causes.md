# Why the planner requests failed

This follows the October 26 review of attempts ending between 12:08 AM and 12:08 PM New York time. The user requested the causes of the failures, explained in plain English. This is a diagnosis, not a deployed fix.

## Saved tasks could not be marked done

All seven rejected completion requests occurred in five runs with no matching successful Calendar or map change after the saved task was opened. The completion check therefore rejected them before deleting the task. Saving the tasks was successful; closing them was the operation that failed.

The code generally requires a recorded successful change in that same run. Reading the original, deciding no change is needed, finding that attendance is already correct, or relying only on a successful earlier run does not qualify. Already-cancelled events have a narrow exception. This can leave work open even when nothing useful remains to change.

Source: `server/automation/staged-pipeline.js:448–473`, `server/automation/adapters.js:895–931`. Three existing production-adapter checks reproduce the already-correct and earlier-run cases. They passed without network calls.

## Seven requests for another page used nonexistent IDs

These were requests to continue large Discord/tool results during the initial stage. They were not saved-task version or owner failures. Every failed request used offset zero and an ID absent from that run's result store. Five used an all-zero ID. One used a version-five UUID, while the server generates version-four UUIDs. The remaining ID also did not identify an available result.

The model supplied incorrect continuation IDs. The reader correctly refused to return data for those IDs. The earlier broad review's wording about saved information was too imprecise.

Source: `server/automation/bounded-result.js:11–13,28–30`; privately retained model proposals matched to run and round. No private proposal values or source bodies are quoted here.

## The conversation still grows when results are split into pages

Both size-limit stops occurred immediately after a page was successfully returned. The production handler then checks the combined conversation against its 262,144-byte limit. Local source hashes match the verified deployed handler and adapters.

At 12:29 AM, the planner requested a task's full saved history and read four additional pages. At noon, it had already used all 16 initial turns without finishing; it kept that initial conversation while opening saved tasks and reading more pages. Both affected runs had one queued input. The first completed its initial stage and reset the conversation before the later full-history reads; the second did not reset it.

Compression reduced the size of history saved in the database. It does not compress the conversation sent to the model. Each page is small, but all previously returned pages remain in that conversation.

An offline reproduction using the production runner and adapters stopped with 266,416 bytes in the conversation, below-limit execution history of 257,184 bytes, and tasks stored in approximately 3 KiB each. This reproduces the mechanism; those are synthetic measurements, not historical payload sizes. No inference or business services were called.

Source: `server/automation/handler.js:247–269,695–699`; private reproduction under `evidence/planner-logging-review-2026-10-26/` and `/tmp/flock-context-debug-20261026/`.

## The access blocks have several different causes

One of the eight rejected person lookups supplied a Discord link without the server ID. It could never match the original link the backend had observed.

The other seven used source IDs, authors and links that were valid elsewhere in the review. The strongest supported explanation is that the planner was working from an older task without obtaining the original again in that run. Reading an old task provides saved context; it does not itself create a current source observation. An offline production-adapter check reproduces that exact pattern: the lookup fails after only reading the saved task, then succeeds with identical arguments after a separate current read of the original. Historical source-window contents were not retained, so this explanation is not proven individually for all seven.

One channel read targeted a channel absent from the current published catalogue. Its link was correctly shaped. The historical reason it was unavailable, such as an exclusion or withdrawal, was not retained. The debugging pass did not read that channel.

The two rejected attendance updates selected the same Discord-backed map activity, whereas that update tool accepts events from the two pinned Calendars. Current roster metadata matches the people requested. This strongly supports wrong event selection; the generic historical error does not establish the exact branch that returned it.

## Missing Discord targets are separate from permission failures

The five historical missing-message targets were rechecked through the production Discord reader at 1:05 PM New York. Fresh published-channel, blacklist and real bot-permission checks passed. Every exact-message endpoint returned HTTP 404, while the channel and bot-access endpoints returned HTTP 200. No messages were sent or changed, and returned content was not saved.

The targets are currently missing or incorrect. The retained evidence cannot establish whether each original message was deleted or the model supplied a wrong message ID. One proposed ID has a conspicuous placeholder-like pattern, but this alone does not establish how it was produced.

## Some requests use the wrong fields or IDs

- Two Discord searches requested 16 results when the maximum is 8. One invalid search also prevented four otherwise valid companion requests from running because the runner rejects the entire group when one proposal is invalid.
- One person lookup put its data under `parameters` instead of `arguments`. That also prevented four companion lookups from running.
- One Discord read supplied an incomplete link without the required server/channel/message path.
- One Calendar read supplied a `discord:...` source key as a Calendar event ID.
- One saved-task read named a different task in its allowed input list.
- One finish request marked an original as requiring no change while a current saved task still retained that original. Its fields were otherwise valid; the completion rules reject that combination.

These are model-generated request mistakes, rather than evidence that the services were offline. Production validation reproductions confirm these paths without network calls.

## Old-log cleanup has a proven query problem; the historical error was discarded

The cleanup query compares each row's expiry against a clock value that can change during the query. PostgreSQL cannot use that comparison to jump directly to the expired part of the expiry index. In a local database with 100,000 unexpired rows, the current query inspected all 100,000; using one fixed cutoff touched only two buffers. The local cleanup itself succeeded.

The caller allows only three seconds and discards the HTTP/error details when cleanup fails. Scanning all retained logs makes a timeout plausible. It is not proven to be the cause of the 12 historical failures. Live SQL inspection was unavailable because the Supabase MCP connection denied access to this project; the app account was used only for read-only metadata requests. No live cleanup was triggered.

Current read-only metadata estimated about 24,000 model records and 71,000 lifecycle records. No records had expired at the review's 12:08 PM cutoff; the earliest expiry was 12:16 PM. Thus those 12 failures were not evidence that already-expired logs had accumulated during the review window.

Source: migration 033 lines 130–135, `server/model-audit.js:71–87`, `server/audit-lifecycle.js:2–8`. An independent evaluator reran the local database comparison and accepted the query-plan finding while retaining the uncertainty about the historical error.

## Some error labels are themselves wrong

Successful diagnostics are written through `console.error`, so Railway labels them as errors. Separately, 63 successful finish operations had status `ready` but a misleading `rejected` outcome. Two real attendance-update tools appeared as `unknown_tool` because the fixed diagnostic name list omitted their name. These labels must not be counted as additional service failures.

## Verification and limits

Read-only evidence includes 775 retained model-call proposals, the original complete tool metadata, current catalogue/person/event metadata, and five scoped current Discord reads. Private proposals and source identifiers stay in ignored, permission-restricted evidence files. Historical raw tool responses were intentionally not retained.

Independent review accepted the confirmed causes with qualifications for the old-log cleanup error, historical missing-message cause and some source-check failures. Seven tool-error reproduction groups passed. Four older selected fixture checks failed before their intended assertions because they assumed a compact task read would return fragments; no tests were changed and these failures do not validate those old checks. No application code, prompts, service configuration, schema or deployment changed. No live Calendar/map/Discord writes or new model inference were performed.

[Independent evaluation](../history/2026-10-26_13-13-29-189354-evaluator-planner-failure-cause-review-accepted.md) · [Integrated diagnosis](../history/2026-10-26_13-13-29-189445-orchestrator-planner-reported-failures-traced.md)
