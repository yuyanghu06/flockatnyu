# Tool health diagnosis — October 21, 2026

The reported Drive failure was a successful search with no matches displayed as
Failed. Private, content-free audit outcomes match the screenshot exactly:
two ready folder listings, an empty search, two ready folder listings, then a
ready document read around 19:41 UTC. No source bodies or credentials were needed
to establish this.

## Findings and correction boundaries

| Finding | Evidence | State |
| --- | --- | --- |
| Successful `empty` results rendered Failed | Live incident audit plus actual Google/Miro adapter regressions in native and planned chat | Local progress correction; model/audit retain `empty` |
| First Drive proposal can stop at skill loading | Two actual hosted model diagnostics proposed `search_drive`; runner returned synthetic skill-activation skips, then model stopped without execution | Local correction replans with the trusted skill before committing an unexecuted native turn; hosted acceptance still required |
| Broad Discord summaries can exhaust their budget | Full live probe returned HTTP 200/partial at 120.1 seconds; 7 of 11 eboard channels completed, 4 aborted on budget | Known latency/coverage limitation; individual reads passed; no timeout/access changes in this pass |
| Empty final answer can be reported done | One diagnostic model stream recorded succeeded/stop with zero returned text; HTTP 200/done carried no answer | Separate unresolved provider/runner issue; do not claim the activation correction fixes it |
| Genuine argument/access denials also exist | Recent audit includes missing-channel Discord proposals, invalid Calendar calls, caller aborts and team-request-required | Keep distinct from connector outages; exact Calendar continuation-token causes cannot be recovered from redacted audit tokens |

The deployed web and update-agent packages were created October 20. Local changes
have not been deployed by this diagnostic pass. Existing unreleased work and its
rollout constraints remain in the milestone snapshot.

## Tool coverage

Production inventories contain 28 chat tools and 21 autonomous planner tools
including `finish_batch`. They have different permissions and request state.

| Surface | Hosted diagnostics | Independent fixture verification |
| --- | --- | --- |
| Discord catalogue/search/original/window/summary | Individual reads ready; broad summary partial after its 120-second bound | Source exclusions, access, time windows, summary coverage and cancellation |
| Gmail search/read | Both ready | Account/scopes/grants, content bounds and prepared worker reads |
| Drive search/list/read | All ready, including another search page; deliberate no-match search returned empty | Real client/tool empty results, opaque cursors, sanitization and authorization |
| Calendar list/read | Both ready | Chat single/batch/bulk changes and autonomous reconcile/cancel with stubbed HTTP |
| Miro catalogue/overview/item | Catalogue/overview ready; canvas content partial because bounded JSON fragmentation | Real wrapper schemas, concrete content, continuations, changed access and quota behavior |
| Map events | Authorized read ready | Fixed catalogues, source/identity checks, complete snapshots and concurrency |
| Identity/attendance lookups | Stateless endpoint denied missing request-local evidence/attendance context as designed | Valid source-backed lookup and attendance selection/write, plus ambiguity/denial cases |
| Memory | Actual hosted agent read completed | Read, optimistic write, persistence, conflict and clearing with disposable local SQL |
| Bug reports and other mutation tools | No successful live mutations attempted | Actual adapters with fake stores/services; schema, authority and receipt handling |
| Planner preparation/fragments/completion | Recent operational audit shows successful executions | Prepared-batch, original evidence, fragments, completion and pending-work gates |

Independent adapter runs passed 314 tests with one optional skip, plus 74 additional
tests; the overlapping focused progress run passed 50 with the same optional skip.
These are execution counts, not unique totals. The optional Miro upstream-schema
capture was absent; fixture schema checks ran. Later activation-fix verification passed 64 focused checks independently; a
separate old/new reproduction confirms the old code executes no Drive read and
the new code executes exactly one while preserving prior receipts.

`POST /api/tools/:tool` is a connector diagnostic route, not the complete chat
execution environment. It omits memory/bug adapters and lacks request-local
Calendar/map/attendance state. Its expected denials do not establish broken chat
write tools. HTTP 200 must also be checked against JSON status and coverage.
`finish_batch/pending` is an incomplete-work receipt rather than a provider outage.
No worker tick was manually triggered and no synthetic batch was enqueued.

## Privacy and follow-up

Ignored `evidence/tool-health/` contains reproducible diagnostic scripts,
content-free aggregate outcomes, public tool schemas and fixture reports. Secrets
are fetched into process memory and not printed or persisted; source responses are
used only in memory. Model-output inspection was limited to operational diagnostics
and argument shapes, not original source archives.

A corrected local full-catalogue runtime using the actual production model and
Google read connector executed a no-match Drive search, emitted completed while
retaining empty, and returned a nonempty answer in 8.946 seconds. All mutation
adapters were blocked for this diagnostic, with zero attempted writes. This
establishes the local correction with real services, not a deployed fix.

Next release should verify a real no-match search emits completed progress and a
fresh Drive request executes after skill activation through the hosted site. Separately investigate empty
answer streams and reduce broad-summary latency while retaining permission checks
and truthful partial coverage. Live mutations require their actual authorized
request context; fixture success does not establish hosted writes.

The subsequent user-requested historical review, reason logging and saved Calendar location receipt correction are documented in [tool-failure-logging.md](tool-failure-logging.md). Actual Go Greek event read confirms the venue was already saved; the lost receipt field was corrected locally. Hosted activation still requires Railway authentication.
