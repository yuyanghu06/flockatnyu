# tasks

## field.calendar-event-id

<!-- prompt: field.calendar-event-id -->
Exact provider occurrence ID: copy map event.source_record_id or Calendar result.eventId. Never copy the map event.id UUID; no automatic ID conversion.
<!-- /prompt -->

## field.person-id

<!-- prompt: field.person-id -->
Copy the complete exact person.id from this speaker's successful lookup_map_person. Never shorten/rebuild it or use a queue/task ref.
<!-- /prompt -->

## resolution-notice

<!-- prompt: resolution-notice -->
These are separate resolution choices, not proof that any choice is currently eligible. Fully read this task, inspect its current originals and needed state, then select the honest outcome. No-change is not a successful mutation; source_missing requires its exact original absence proof.
<!-- /prompt -->

## compact-context

<!-- prompt: compact-context -->
Historical batch context and executionHistory remain saved unchanged. Use detail="full" only for a specific missing fact; large histories remain available with detail="history", historyOffset and the exact expectedUpdatedAt from each page. Compact includes the complete request, original inputs and source references; cache data is not a current source check.
<!-- /prompt -->

## full-pagination-required

<!-- prompt: full-pagination-required -->
The full saved task exceeds the remaining fragment budget. Read detail="compact" for its complete original intent and action binding. For a specific historical fact, use detail="history", historySection="task", historyOffset=0 and expectedUpdatedAt from this response, then continue with each nextOffset and the same exact version. These task pages preserve all historical fields, including batchContext and executionHistory. No full-view or action read proof was granted by this response.
<!-- /prompt -->

## default-summary

<!-- prompt: default-summary -->
Deferred source work
<!-- /prompt -->

## defer.description

<!-- prompt: defer.description -->
Save only a genuine unfinished source-supported action or essential unresolved interpretation needed for one. Confirmed no-change/already-satisfied inputs are directly handled: never create a NEW task as a processing receipt, audit/archive or record of a handled decision. summary and operation are required for new tasks AND updates; optional fields are taskId, calendarEventId, calendarKind, personId and buildingId only. The runtime retains supporting originals, observed context and actual execution history; do not supply extra context fields. To update, read_pending_task first and bind its current task ref or exact UUID in inputIds and taskId. Saving progress does not resolve the task or prove a source fact.
<!-- /prompt -->

## read.description

<!-- prompt: read.description -->
Read one selected saved task. Default detail=compact returns its complete request, originals, references and small Calendar routing context. Use detail=full only for a specific missing historical fact. Large full views return history_pagination_required; detail=history returns a lossless bounded JSON-history page. Continue with historyOffset=nextOffset and the SAME expectedUpdatedAt from the page; pages alone grant no action proof. Bind this task ID in inputIds for reads and fragment continuations. No live source/Calendar checks occur; choose their separate tools as needed. Untouched tasks survive automatically.
<!-- /prompt -->

## read.detail

<!-- prompt: read.detail -->
Defaults to compact. Full/history views are optional; request only a specific missing historical fact.
<!-- /prompt -->

## read.history-section

<!-- prompt: read.history-section -->
For detail=history only. Defaults to executionHistory; task pages preserve the entire saved task, including historical batchContext and metadata.
<!-- /prompt -->

## read.history-offset

<!-- prompt: read.history-offset -->
UTF-16 character offset for detail=history. Default0; copy nextOffset for continuation.
<!-- /prompt -->

## read.expected-version

<!-- prompt: read.expected-version -->
Exact saved updatedAt version. Required when historyOffset is greater than0; copy it unchanged from the history page.
<!-- /prompt -->

## read.scope

<!-- prompt: read.scope -->
Read this saved task using its own task ID in inputIds.
<!-- /prompt -->

## read.already-read

<!-- prompt: read.already-read -->
This exact task view was completely read earlier in this phase. Reuse its earlier data; no new read/action proof.
<!-- /prompt -->

## resolve.description

<!-- prompt: resolve.description -->
Close one fully read current saved task. outcome=completed requires a matching confirmed action. outcome=no_change_needed is a separate reviewed decision with reason=already_correct or no_actionable_request; current original evidence and any needed target-state read are required, but no fake write. outcome=source_missing requires a confirmed exact missing original, not an unavailable or denied source or an incidental missing message. The backend checks the exact task/version, source scope and proof; failed work remains saved. Bind this same task in inputIds and taskId.
<!-- /prompt -->

## fragment.scope

<!-- prompt: fragment.scope -->
Continue this saved task fragment using its owner task ID in inputIds.
<!-- /prompt -->

## fragment.next-offset

<!-- prompt: fragment.next-offset -->
Continue with the returned nextOffset for this task.
<!-- /prompt -->

## finish.current-cycle-incomplete

<!-- prompt: finish.current-cycle-incomplete -->
Current-cycle participation work still needs its complete current task read and action/resolution, or an actual verified dependency blocker. Continue these tasks before finish_batch.
<!-- /prompt -->

## unfinished-initial-summary

<!-- prompt: unfinished-initial-summary -->
Unfinished initial source interpretation
<!-- /prompt -->
