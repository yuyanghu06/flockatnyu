# Model usage since Thursday's planner rollout

## Scope and result

Read-only review of Flock's production model audit from **October 22, 2026,
1:21:20 PM through October 24, 10:15:56 AM**, America/New_York. The start is
Railway's creation time for the first Thursday worker deployment,
`bede3de6-1378-4e23-946b-a99c9fdfe35e` (`2026-10-22T17:21:20.651Z`). It
marks rollout start; the worker was independently recorded running by 1:26 PM.
The deployment's later removal time was not used as its activation time.

| Production agent | API attempt records | Known input tokens | Known output tokens | Recorded cost estimate |
| --- | ---: | ---: | ---: | ---: |
| Planner, including one quota diagnostic | 5,515 | 121,836,169 | 503,886 | $4.327204165 |
| Chat | 325 | 7,579,836 | 53,665 | $0.462515880 |
| Total | 5,840 | 129,416,005 | 557,551 | **$4.789720045** |

All observed records name `gpt-6-luna`, `api.openai.com` and the default tier.
Planner represents about 90% of the recorded cost subtotal. Its known input
includes 96,991,024 cached-read tokens (79.6%); these are already included in
input tokens and must not be added again. Output totals already include any
reported reasoning tokens. Token counts describe repeated model requests,
including retained conversation/tool context; they do not count unique messages.

| New York day | Planner estimate | Chat estimate | Coverage |
| --- | ---: | ---: | --- |
| Thursday, after 1:21 PM | $0.664305550 | $0.151067180 | 876 API attempt records |
| Friday | $3.662898615 | $0.311448700 | 3,459 API attempt records |
| Saturday, through 10:15 AM | Unknown | No chat records | All 1,505 planner attempts lack price/usage |

For comparison, including Thursday before the first rollout would raise the
recorded production subtotal to $5.961386790. That broader midnight window is
not the main result above.

## What the records establish

There are 5,514 ordinary planner model-attempt records across 1,021 distinct
planner run IDs, plus one separately named `diagnostic_quota_probe`. Run IDs
represent batch attempts that entered the model-audit/request stage; they do not establish
completed planner passes, distinct messages or the count of preflight failures.
Chat has 65 distinct run IDs. Retries each have their own call UUID.
Six records have no HTTP status (three unresolved `started` and three aborted);
the audit records alone do not prove all six were dispatched to the provider.

Of the reported 5,840 records, **4,201 have a saved price estimate and 1,639 do
not**. Unknown prices consist of:

- Planner: 1,616 HTTP 429 rejections, two aborted calls and one unresolved
  `started` record. The rejections include the single quota diagnostic.
- Chat: 17 successful calls missing complete cache usage, two unresolved
  `started` records and one aborted call. The 17 successful calls report
  245,026 input and 2,060 output tokens, included in the token totals above.

The 1,616 rejections comprise 1,503 older `provider_unavailable` records and
113 `credit_balance_exhausted` records. The older records do not retain the
provider's precise rejection subtype. Neither missing usage nor a rejection
establishes that the request was free.

Known planner prices include $0.122732250 for 34 accepted HTTP responses that
the application could not parse completely or validly. Those calls are included
even though the model operation failed.

## Limits and verification

**This is a known-cost estimate subtotal, not an invoice or complete account
spend.** It sums each record's saved estimate and recorded October 19 price
basis; it does not reprice calls or verify the account's billing dashboard.
Missing fields remain unknown. Other applications or keys on the account are
outside this audit.

Local actual-model test harnesses can inject no-op audit writers. Their requests
can incur charges without appearing in production `agent_model_calls`; therefore
these totals cannot separate all development testing from ordinary operation or
establish the account's full spending. See the linked history for surviving
local-test evidence and its limits.

The local evaluation inventory documents **211 additional test requests** within
this window, with unknown billed usage/cost:

- Thursday: 18 attendance requests and 35 full-prompt-audit requests, documented
  in the final journal receipts. Their original temporary ledgers are gone;
  intermediate prompt-audit counts overlap and were not added again.
- Friday: 158 requests in 15 surviving, distinct ledgers: 95 chat time/recovery,
  38 planner follow-up, 14 participant normalization and 11 Spotlight steering.

The corresponding harnesses explicitly inject no-op audit writers, so these
requests are excluded from the production table above. This is an incomplete
inventory of local testing, not a complete additional bill or a count of all
manual tests against production. Evidence families are
`evidence/chat-time-queue-2026-10-23/`, `evidence/planner-followup-focus/`,
`evidence/chat-map-participants/` and `evidence/spotlight-steering-2026-10-23/`.
Thursday receipts are
[attendance](../history/2026-10-22_19-15-53-544934-tester-normal-attendance-real-model-verified.md)
and [full prompt audit](../history/2026-10-22_19-33-24-710330-tester-full-prompt-behavior-verified.md).

The broad Thursday-midnight export contains 6,892 unique call records across
seven pages; filtering by `started_at` produces the 5,840 records above. The
private ignored export selected only call identity, timing, status, model,
operation, usage and price metadata. No prompts, source-tool responses, model
outputs or credentials were retrieved. Evidence is under the ignored
`evidence/model-usage-since-thursday-2026-10-24/` folder, including the query
manifest, metadata hash and both window summaries.

Acceptance requires independent recount, correct rollout/time-zone boundaries,
explicit unknown usage/cost, and separation from unlogged tests. No application
code, deployment, provider configuration, billing or business data changes are
part of this review. No inference requests were made for this usage check.

Current review status and pass receipts are linked from
[the rolling milestone](../milestone.md).
