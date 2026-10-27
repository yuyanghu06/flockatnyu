# Planner problems over twelve hours

Goal: check the planner's main problems and explain them in plain English.

Status: complete; independent source research and evaluator ACCEPT. This review changed only documentation. No planner fixes or external writes were made.

Follow-up debugging matched actual model requests to each failure, reproduced the conversation-size and completion problems, and checked five missing Discord targets through normal current permissions. [Why the failures happen](debug-causes.md) distinguishes confirmed causes from unavailable historical details. Runtime fixes remain unimplemented.

Window: October26,2026 **12:08AM–12:08PM America/New_York** (04:08–16:08UTC). Railway returned46 terminal attempts. Attempts may revisit the same inputs, include work started before the window and exclude work still active at the cutoff.

## Main findings

- **It often stops before finishing.**22 distinct attempts hit an allowed-step limit somewhere. Main status was completed33times, round-limit10times, accumulated-text limit twice and invalid completion once. Of33 main completions,12 left follow-up capped;21 reported both parts completed. Neither result proves every saved task or Calendar/map update was completed correctly.
- **Some saved work cannot be closed.** None of seven recorded close-task attempts succeeded. The system could not confirm completion; the exact failing condition in each case remains unverified. There were109 successful saved-task reads and36 successful postponements. Expiry can independently remove tasks, so this does not mean no task rows were deleted.
- **Reading saved information still causes problems.** Seven requests for another part of saved context and one saved-task read were rejected. Two runs stopped after retained information exceeded a local limit; the exact limit in each run is unknown. Logs do not retain arguments, so identical duplicate reads are not established.
- **Smaller reads/checks fail.**11 access blocks include eight person lookups, one Discord channel read and two operations whose names use the diagnostic fallback. Five Discord message reads returned not_found. Missing/deleted/wrong/inaccessible targets are not distinguishable from these records alone.
- **Deleting old logs fails every hour.**12 observed hourly audit-prune attempts failed. This may retain expired logs; it does not prove new logs were lost or explain why the cleanup failed.

All107 recorded task-save attempts returned ready. No task-save failure was observed in that query. This supports improvement in saving, without direct database readback.63 successful finish_batch diagnostics were incorrectly marked rejected and excluded from failure totals. Successful diagnostics also appear with error severity because the logger uses console.error.

The tool query returned1,065 unique diagnostics across four contiguous windows, all below the500-row response cap.33 completed attempts acknowledged96 input items; these are acknowledgements, not96 event updates or guaranteed distinct originals. Zero agent_model_failure rows does not prove every model request succeeded. No current backlog, billing, expired-row deletion or business-result correctness was independently verified.

Evidence: ignored evidence/planner-logging-review-2026-10-26/twelve-hour-metadata.json contains safe operational metadata and reproducible totals; no prompts, model outputs, source bodies or credentials. A supplementary one-hour source/log explanation remains in railway-metadata.json.

Next action if requested: fix the failure to finish saved work, reduce wasted continuation/read steps, then investigate accumulated-text stops and hourly log cleanup. No new limits or deployment changes were selected by this review.

[Independent review](../history/2026-10-26_12-14-02-274027-evaluator-planner-twelve-hour-problems-accepted.md) · [Integrated findings](../history/2026-10-26_12-14-02-274095-orchestrator-planner-last-twelve-hour-problems-reviewed.md)
