# Planner throughput diagnosis

Goal: explain why production claims only two originals and identify the measured time costs. Scope: read-only live configuration and operational metadata, local code tracing, independent timing analysis and independent evaluator review. Status: complete; tester PASS and evaluator ACCEPT. No runtime, schema, configuration, queue or business changes; no new inference or source-content requests.

## Two inputs is an explicit production cap

Fresh filtered Railway CLI readback confirms AGENT_AUTOMATION_MAX_INPUTS=2, MAX_ROUNDS=16, FOLLOWUP_ROUNDS=10, MAX_CALLS=64, MAX_FOLLOWUP_CALLS=64 and MAX_RUN_MS=600000. Live Discord request spacing is1000ms. Only these nonsecret values were retained; credential-bearing variable output was captured privately and discarded.

The source default is20inputs. The October18 recovery receipt records a five-input run taking569.325seconds against the600second budget, followed by maxInputs5→2 for headroom. Later staged releases preserved this tuning. Thirty eligible originals or an oldest age of30minutes triggers work; it is separate from the number claimed. Retry lanes deliberately claim one original.

## Actual recorded performance

The fixed window is October25 4:00–4:46:43PM America/New_York. Eleven complete runs actually span approximately4:14–4:45PM; one additional run remained active. Complete runs claimed20input attempts, acknowledged13, and ended7completed/3preflight_failed/1round_limit. Claims include retries; completed does not guarantee all follow-up finished.

Median run duration is157.645seconds, range67.721–254.176seconds. The13acknowledgements over approximately30.78minutes of active wall time imply about0.42inputs per minute in this bounded cohort. Four zero-acknowledgement runs consumed585.026seconds,33.15% of total run time.

| Disjoint category | Seconds | Share of total run time |
| --- | ---: | ---: |
| Tool operations | 923.740 | 52.34% |
| Model turns | 460.447 | 26.09% |
| Preparation | 25.056 | 1.42% |
| Unclassified checks, transitions and completion | 355.574 | 20.15% |

Do not interpret unclassified time as proven CPU usage. Tool operations include authorization, lease and action-receipt work. Nested storage diagnostic durations overlap these categories and are not added separately.

The largest named operation was64Discord-message reads,518.899seconds,29.40% of all run time, median7.553seconds. Including Discord window/search tools raises the share to33.04%. Code tracing shows an ordinary warmed nonthread read normally performs six Discord GETs for guild/application, channel/roles/member and message/context. They pass through one serialized pacer. At1000ms spacing, network and access-check work accumulate inside a single tool call. Initial bot identity or threads can require more. This is code topology plus measured tool duration, not an HTTP-level timing trace; all current access/revocation checks must remain.

All172model requests in the complete cohort succeeded withHTTP200; median durable-audit elapsed time was2.085seconds. Many turns accumulate to26.09% of run time. No provider quota rejection or retry explains this cohort.

Ten Calendar-to-map calls consumed125.921seconds,7.14%, median12.583seconds. Both pinned Calendars are scanned over yesterday through eight days ahead. This is repeated per-cycle overhead, but smaller than Discord retrieval and model time here.

Forty-one saved-task reads took34.669seconds,median0.826seconds,1.96%. Reading storage is relatively quick; subsequent source reads and decisions are expensive. For ten runs with a clear sync-to-follow-up transition, first follow-up model request through settlement consumed619.118seconds,35.08% of total cohort run time; this is a lower bound excluding transition work and the no-sync cap run. Follow-up time overlaps the categories above.

## Repeated work and failed completion

Each two-original cycle can expose all eligible saved tasks for follow-up. Only one or two selected tasks are active at once, but blockers and read receipts reset each cycle. The initial model transcript is replaced on a normal phase transition; compact saved-task views omit full observed history. This can lead to requesting information again. Equivalent within-cycle reads are an optimization candidate; fresh cross-cycle source checks can be necessary.

Privacy-preserving extraction retained only tool names, run/round metadata, argument-key names and argument hashes. The full window, including its open run, has68Discord-read proposals with42distinct exact argument fingerprints; five excess identical-argument proposals occurred within one run. These are proposals, not an individual execution mapping. Exact-original and context reads differ; not every repeated call is proven avoidable. No model text or argument values were persisted for this comparison.

At4:33:13PM and4:40:10PM, task saves returned invalid_request after successful258421-byte task reads. A third generic preflight failure at4:38:26PM lacks a rejected-save record, so its exact cause remains unknown. These records confirm ongoing save failures; prior local reproduction establishes size-limit mechanisms but does not prove every current generic failure is identical. No-acknowledgement runs waste processing time and retain originals for retries.

Between-run gaps have a median5.53seconds. The60second cooldown is measured from the prior run's start, so long runs usually satisfy it before completion; it is not another minute after each run. Tools execute sequentially under one global runner lease.

## Verification and next action

Ignored evidence/planner-throughput-2026-10-25/ contains safe configuration, ten unsaturated contiguous log windows,177model metadata records/560lifecycle records, independent analysis and hash-only read proposals. Eleven complete-run model calls number172; remaining requests belong to the open run. Railway buffers/reorders timestamps, so analysis uses monotonic progress elapsedMs after run assignment. Final pairing has zero errors or overlaps. Current queue snapshots are not frozen to the analysis cutoff.

Suggested order: fix completion/task-history failures; reduce equivalent reads and repeated unchanged blocked-task work while preserving current source checks; carry sufficient current-cycle observations into follow-up; then retune the inherited two-input cap against representative current workflows. The old cap can amortize preparation/sync poorly, but increasing it alone does not repair failed saves or repeated follow-up. No new cap, timeout, pacing or tool limit was selected or changed.

The deployment guide's old32-call statement is historical; current code and live settings confirm64calls per stage. Researcher, tester, evaluator and primary integration receipts are linked from the rolling snapshot.
