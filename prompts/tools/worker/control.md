# control

## prefix.context

<!-- prompt: prefix.context -->
Read-only context tool. 
<!-- /prompt -->

## prefix.action

<!-- prompt: prefix.action -->
Idempotent action tool. 
<!-- /prompt -->

## finish.staged

<!-- prompt: finish.staged -->
Call alone with bare {handledInputIds}, never the ordinary wrapper. A queue input is handled when its required change succeeded, genuine unfinished actionable work was durably deferred, OR current evidence confirms no required change/already-satisfied intent. Handle that last category directly WITHOUT a write or NEW task; do not save a processing receipt. Copy only listed queue refs (q_...) or their exact UUIDs; task refs never finish queue inputs. [] ends this phase without claiming additional handled originals. Backend action/task completion checks still apply.
<!-- /prompt -->

## finish.initial

<!-- prompt: finish.initial -->
 Initial phase also accepts noChangeInputIds: explicitly list exactly the originals requiring no change/already satisfied, excluding originals covered by an applied source write or current durable task. The two lists together declare handled originals; noChangeInputIds may be separate from handledInputIds or overlap it. Neither list may repeat an original internally. Missing noChangeInputIds means []. missingInputIds is a subset of handledInputIds for exact queued originals whose separate authorized exact read returned source_missing; it cannot clear an incidental or guessed missing target, a denied read or unavailable service. Reads/lookups do not otherwise cover an original.
<!-- /prompt -->

## finish.base

<!-- prompt: finish.base -->
Call alone with {handledInputIds}, not the ordinary {inputIds,arguments} wrapper. Include only handled queue UUIDs whose required actions succeeded or were durably deferred. In a staged cycle, [] ends the current phase without claiming additional inputs; unfinished work survives. In legacy mode, [] returns pending and cannot complete the batch. Backend completion checks still apply.
<!-- /prompt -->
