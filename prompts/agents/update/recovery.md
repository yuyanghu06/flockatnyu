# recovery

## sync-budget

<!-- prompt: sync-budget -->
Synchronization was not dispatched because this stage exhausted its tool-call budget.
<!-- /prompt -->

## sync-failed

<!-- prompt: sync-failed -->
Synchronization failed. No successful result was confirmed.
<!-- /prompt -->

## sync-invalid-result

<!-- prompt: sync-invalid-result -->
Synchronization did not return a usable result.
<!-- /prompt -->

## exact-person-id

<!-- prompt: exact-person-id -->
Copy the complete exact person.id already returned for this bound original. Resubmit defer_task with a new call ID; no calls in this turn were executed.
<!-- /prompt -->

## finish-alone

<!-- prompt: finish-alone -->
Call finish_batch alone. Resubmit the other calls without finish_batch, then finish separately.
<!-- /prompt -->

## turn-rejected

<!-- prompt: turn-rejected -->
Turn rejected before execution. No calls in this turn were executed.
<!-- /prompt -->

## group-participation

<!-- prompt: group-participation -->
Group compatible people for the same event into ONE patch_map_participation call. For separate dependent patches, wait for the first applied result and use its returned updatedAt as the next expectedUpdatedAt.
<!-- /prompt -->

## complete-task-read

<!-- prompt: complete-task-read -->
Turn rejected before execution. Complete each required task read using its taskRef in inputIds: continue the listed fragment id at nextOffset through null, or call read_pending_task with taskId=taskRef when no fragment is listed. Then resubmit the action; do not rewrite unchanged tasks.
<!-- /prompt -->

## uncovered-inputs

<!-- prompt: uncovered-inputs -->
These handled originals have neither an applied source write nor a current durable task. For each, perform its supported remaining action, save its genuine unfinished action, or explicitly include it in noChangeInputIds if current evidence confirms no required change/already satisfied. Reads/lookups are not completion. Finish again with an exact disjoint accounting.
<!-- /prompt -->

## empty-finish

<!-- prompt: empty-finish -->
No inputs were completed. Perform remaining required work, then call finish_batch alone with the actual queued UUIDs you successfully handled. An empty array never completes the batch.
<!-- /prompt -->

## tool-failed

<!-- prompt: tool-failed -->
Tool call failed. No successful result was confirmed.
<!-- /prompt -->

## task-read-again

<!-- prompt: task-read-again -->
Read the current task again using this taskRef in inputIds and taskId.
<!-- /prompt -->

## task-fragment-next

<!-- prompt: task-fragment-next -->
Continue this task fragment with this taskRef in inputIds and the returned nextOffset.
<!-- /prompt -->

## task-fragment-scope

<!-- prompt: task-fragment-scope -->
Bind this taskRef in inputIds when reading this task or continuing its fragments.
<!-- /prompt -->

## participation-endpoints

<!-- prompt: participation-endpoints -->
No participation changes were applied. For every new person, explicitly provide both start and end using supported endpoints, including {inherit:true} when inheriting the event boundary. Resubmit the complete corrected patch.
<!-- /prompt -->

