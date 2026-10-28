# Planner OpenAI spending, October 21–28, 2026

## Goal and scope

Estimate the running planner's OpenAI cost for the last seven days and explain the largest spending categories. This is a read-only operational review. Chat, local model tests, Railway hosting and third-party service charges are outside the subtotal.

## Completion criteria and status

Metadata pagination must be complete; token pricing must reconcile independently; missing usage and attribution limits must be disclosed. Collection, independent research and independent evaluator review are complete; evaluator ACCEPT. No application, private configuration, billing, queue or deployment changes are part of this milestone.

## Window and estimate

The fixed 168-hour window is October 21, 2026 at 11:40:49.896 AM through October 28 at 11:40:49.896 AM, America/New_York. Recorded cost is **$24.360149880**, approximately **$24.36**.

There are 22,127 regular planner model attempts, 20,506 with complete token counts and priced estimates, across 2,520 regular planner runs. A separate unpriced diagnostic quota probe is excluded from regular attempt/run counts. All observed calls use direct OpenAI GPT-6 Luna with default service tier. The full collection includes 22,128 model records and 70,182 lifecycle events, without reading model outputs or source content.

## Where the cost goes

| Model processing | Recorded cost | Share |
| --- | ---: | ---: |
| New context stored for reuse (cache writes) | $16.90574600 | 69.40% |
| Previously stored context read again | $6.25934458 | 25.70% |
| Other input | $0.00615180 | 0.03% |
| Generated replies and tool instructions | $1.18890750 | 4.88% |

Input/context processing accounts for 95.12% of cost. The model processed 761.24 million input tokens and generated 2.38 million output tokens. Recorded tool starts are dominated by Discord message reads (8,397), saved context-fragment reads (4,598), saved-task reads (4,039), map reads (2,697) and person lookups (2,489). Tool counts describe workload; they are not per-service dollar attribution and do not establish unique messages or tasks.

| Final recorded run outcome | Cost of model calls within window |
| --- | ---: |
| Completed | $11.656973505 |
| Preparation/check failure | $6.483687210 |
| Model-turn limit | $3.031206390 |
| Context limit | $1.003647880 |
| Provider unavailable | $0.950171340 |
| Aborted | $0.637807205 |
| Other incomplete outcomes | $0.596653350 |

Runs ending in preparation errors, model-turn limits or context limits account for $10.51854148 (43.18%). These amounts are not all wasted: useful actions can complete before a later stage fails. A completed run also does not guarantee every saved follow-up task was resolved. About $0.39 in estimated cost came from model responses later rejected by application parsing/completeness checks.

## Daily recorded cost, New York time

| Date | Cost |
| --- | ---: |
| October 21, from 11:40 AM | $1.17 |
| October 22 | $1.84 |
| October 23 | $3.66 |
| October 24 | $5.09 |
| October 25 | $7.47 |
| October 26 | $3.00 |
| October 27 | $1.74 |
| October 28, through 11:40 AM | $0.39 |

Daily and component amounts round independently.

## Verification and limits

Official [GPT-6 Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna) confirms $0.10 input, $0.01 cached input, $0.125 cache writes and $0.50 output per million tokens for the observed standard/default short-context calls. All priced calls are below the 272,000-token long-context threshold. Independent source-based price recomputation finds no per-call discrepancy.

The regular planner has 1,621 unpriced attempts: 1,615 HTTP 429 rejections, one HTTP 520, two aborted calls and three unresolved records. Their charge is unknown; no billed cost is inferred from rejection counts. Adding the excluded quota probe yields 1,622 unpriced audit records. The subtotal is not an OpenAI invoice and omits local evaluations without production audit records. Exact dollars per source service or initial/follow-up stage cannot be established from these tables.

Private ignored evidence is in evidence/planner-spend-2026-10-28/: metadata.json, summary.json, analysis.json, collection/analysis scripts and count-check.json. HEAD/count=exact checks match both complete paginated row counts. Credentials stayed in memory, and neither prompts nor raw audit outputs were fetched. No inference or live business writes were performed for this review.

## Next action

The estimate has been delivered. The user requested advice on reducing spending; the recommendations below remain unimplemented. No worker activation is selected.

[Independent evaluation](../history/2026-10-28_11-45-24-949660-evaluator-planner-seven-day-spend-accepted.md) · [Final review](../history/2026-10-28_11-45-24-949661-orchestrator-planner-seven-day-spend-completed.md).

## October 28 follow-up recommendations — no implementation

First reproduce expensive failures on the current release: the seven-day window includes versions whose known defects have already been addressed. Compact reads, compressed saved history, observation reuse, accepted no-change closure and selective conversation retirement already exist.

1. Persist exact-version retry eligibility and reasons separately from task payloads. The current five-minute old-task retry Map is process-local and updated only after all checkpoints save; failed checkpoints and restarts bypass spacing. Preserve unfinished tasks, confirmed outcomes and fresh/changed-input exceptions. Diagnose current save failures before replaying expensive model work.
2. Keep reusable instructions stable and place changing trusted phase/clock/task context later. The current prompt changes within its first two lines each cycle/stage. Verify tool-definition changes as well; retain exact backend source/identity/version enforcement. [Official caching guidance](https://developers.openai.com/api/docs/guides/prompt-caching) supports stable prefixes, but this is not a measured savings claim.
3. Evaluate earlier removal of resolved/superseded result copies only when no unfinished task needs them. Existing compaction usually waits for roughly 192 KiB; earlier changes can also invalidate cached prefixes, so compare actual cost and correct task outcomes before adopting.

A persistent provider pause for confirmed exhausted credits is a separate reliability option; immediate hard-quota retry classification already exists, and unpriced rejections do not establish significant billed waste. Held fragment-ID and audit-cleanup changes remain held. Keep current model and execution limits while measuring cost per correctly resolved task, correct applied fields and preserved unfinished work.

[Research review](../history/2026-10-28_11-51-09-885150-researcher-planner-spending-remedies-reviewed.md) · [Recommendation pass](../history/2026-10-28_11-51-09-885151-orchestrator-planner-spending-remedies-recommended.md).
