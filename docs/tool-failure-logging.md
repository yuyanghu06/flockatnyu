# Tool failures and operational diagnostics

## Historical baseline

Requested window: October 18, 2026 00:00 UTC through October 21, 2026
20:14:10 UTC. The retained audit starts October 19 at 16:16 UTC; no earlier audit
coverage is claimed. All 20 pages were read: 19,755 lifecycle records, including
8,463 terminal tool records and 1,414 terminal runs.

| UTC date | Tool records | Successful | Error status | Denied | Cancelled | Pending/skipped | Partial |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| October 19 | 1,504 | 1,342 | 142 | 6 | 5 | 6 | 3 |
| October 20 | 3,818 | 3,281 | 504 | 11 | 4 | 17 | 1 |
| October 21, through cutoff | 3,141 | 2,991 | 36 | 7 | 4 | 103 | 0 |

These are observed statuses, not a provider-outage rate. Error status includes
missing records and failed preconditions. Empty is successful; pending completion,
coverage limits and access denials need separate treatment. Historical events lack
dispatch/reason metadata, so a precise execution failure rate cannot be reconstructed.

The largest tool error groups were 527 planner map reads returning unavailable,
54 invalid planner Calendar listings, 47 missing Discord messages and 19 unavailable
identity lookups. All 527 unavailable map reads occurred October 19–20 in this
window. Missing detailed reasons cannot establish which individual operations timed
out or failed upstream. Fifty planner runs ended invalid_tool_call before their
rejected proposals had tool lifecycle records.

A separate model-metadata query through 20:14:59 UTC found 277 planner responses
rejected as invalid_provider_response despite HTTP 200, three incomplete planner
responses, one unavailable planner request, four incomplete chat responses and one
unresolved model start. A later inspection found 278 rejected planner outputs;
all contained more than eight proposed calls in one turn, exceeding the existing
parser cap. The later count includes ongoing work after the baseline cutoff.
The cap and execution behavior are unchanged by diagnostic logging.

Railway runtime queries covered October 18 through October 21 20:00 UTC, splitting
saturated windows until every selected page was below its limit. They found 2,702
selected worker failure/progress records, 39 failed Discord replies, five collector
failures and 358 Gmail collector google_unavailable statuses. Progress and terminal
run rows can describe the same failure; do not add these to audit call counts.
Collector/reply failures are separate from model tool execution. The web also had
11 older startup-failure entries. Historical logs usually contain status only.

## New diagnostic records

Chat and planner terminal diagnostics reuse service-only agent_audit_events and
its existing seven-day default retention. No migration or public retrieval API is
added. Versioned fixed numeric fields live in counts. Their append-only mapping
is exported as DIAGNOSTIC_CODES from server/tool-diagnostics.js; never reorder
version-1 entries when extending the vocabulary.

| Field | Meaning |
| --- | --- |
| diagnosticsVersion | Encoding version; absent means legacy |
| reasonCode / stageCode / outcomeCode | Fixed failure cause, operation stage and outcome |
| dispatched | Whether this model tool proposal actually entered its adapter |
| proposalSequence | Request-local correlation; rejected proposals do not consume executed-call budget |
| validationCode / schemaFieldId | Fixed schema rule and reviewed field identity; never an argument value or unknown property name |
| observedHttpStatus | Actual observed response code; omitted when none was observed |
| retryabilityKnown / retryable | Classification only; it does not authorize replaying a mutation |
| sourceOutcomeCode / sourceReasonCode / deferred | Underlying source result when worker transport normalized it to ready |
| batchFailed / batchUnattempted | Bounded item counts for partial Calendar batches |

Railway receives agent_tool_diagnostic and agent_run_diagnostic records with
run UUID, round, registered tool name, duration, fixed decoded status/reason/stage/
outcome labels and their numeric codes. Predispatch rejection, duplicate, budget,
policy denial, caller cancellation, successful empty result and incomplete coverage
remain distinct. Unknown custom names become fixed sentinels. Logging sink
failures cannot change execution, produce retries or fabricate completion.

Calendar batches preserve the primary failed item's cause/stage/observed HTTP in
the durable tool summary, while the overall result remains partial. Every failed
or unattempted item also emits agent_tool_batch_item_diagnostic with the parent
event/run/round/tool and item index. Per-item detail is Railway-only and subject to
Railway retention; the seven-day audit stores the primary cause and aggregate
counts. No extra audit rows or model-call attempts are fabricated. Unattempted
rows never claim an HTTP response.

Model tool-response parser failures additionally emit agent_model_failure and
retain fixed response-validation diagnostics in the existing private model audit
output. This distinguishes too_many_tool_calls, malformed arguments, invalid
shapes, duplicate/reused call IDs and parsing/size failures without logging bodies.

Google failures retain local validation, OAuth, account verification, Calendar ACL,
provider request and response parse stages. Map failures retain bounded-work
cancellation/deadline, storage response/HTTP and invalid-snapshot distinctions.
Existing tool status values, access checks, deadlines and write behavior remain.

## Failure-rate use and privacy

For new records, use tool_finished with diagnosticsVersion=1 and dispatched=1 as
the execution denominator. Count failed outcomes separately from rejected proposals,
policy denials, cancellations, pending work, valid empty results and partial coverage.
Batch-item Railway records are suboperation details, not additional model tool
attempts. Keep legacy/unknown records separate rather than guessing dispatch.

Only fixed codes, numeric counts, known schema field identities and operational
correlation IDs are logged. No prompts, uploads, argument values, source responses,
provider bodies, raw exception text, event titles, locations or credentials enter
these diagnostics. Locations remain business receipt data, not diagnostic fields.
The assistant and public frontend have no audit retrieval access.

The local implementation and hosted activation status are separate. See the
rolling milestone for the current release/authentication boundary. Evidence under
ignored evidence/tool-failure-logging contains content-free historical aggregates,
correlation records, reproducible scripts and test reports; model/source bodies
were not retained there.

Final local verification: 463/463 integrated tests and 113/113 independent evaluator checks passed, with API build, whitespace and source-hash verification. Calendar receipts were independently accepted. A read-only check confirms the actual Go Greek event already has the expected address saved; no Calendar data was changed. Activation is blocked by expired Railway CLI and connected-app OAuth; the new code is not live.

## Follow-up: most common diagnoses

The retained model outputs establish the excessive-call cause exactly: all277
responses in the baseline proposed9–14calls.151proposed10and80proposed11.
Of2,886proposedcalls,2,794were read_map_events. The planner is over-batching
per-event map checks; the native parser rejects the whole turn above8. Its prompt
encourages batching independent reads without stating that per-turn ceiling.
No tool execution occurs from those rejected responses.

The map deadline failure mechanism was reproduced before the October20 release:
the database read succeeded in1.066seconds, but sequential original Calendar
access checks caused the old5-second combined budget to expire. A15-second
diagnostic run completed in6.607seconds. Every one of the527historical map
unavailable results predates the60-second rollout. Between that rollout and
the baseline cutoff,694map reads contain691ready and3aborted, with zero
unavailable. This supports the timeout diagnosis and its shipped mitigation,
without assigning an unrecoverable underlying exception to every old row.

All54invalid planner Calendar calls have exactlyone matching model proposal,
valid visible schema/time-window/limit arguments and a redacted page cursor;
each follows a successful read for the same window. This narrows the common
diagnosis to continuation handling: an incorrect/stale cursor or continuing
after the final page is plausible. Exact cursor equality, page completeness
and local rejection versus actual Google400 cannot be reconstructed. Do not
claim a particular cursor mistake was proven for all54.

Suggested next fixes are an explicit/enforced per-turn proposal limit and
reliable continuation stopping/reuse. No runtime edits, deployments or Calendar
changes were made in this diagnosis-only follow-up.

## Local reliability follow-up (2026-10-21)

User authorized a five-minute broad Discord summary, backend Calendar pagination and reduced map read overhead. The broad summary now shares300seconds across its selected channels; the website overall default is420seconds, while individual source/model limits and explicit overrides remain separate. Map reads deduplicate exact source-original checks within one validated snapshot and run at most four authorization checks concurrently in each event/participant phase; later reads and both write checks remain fresh. Calendar traversal and worker completion feedback are implemented and independently accepted locally:445integrated tests pass, with API build and whitespace checks passing. Complete unfiltered subwindows must cover the reconciliation interval without gaps; conflicts require fresh map state. These local changes do not alter the historical diagnoses above or establish a production rollout.
