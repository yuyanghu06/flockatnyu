# Per-request chat tool selection

`../retrieval.js` validates context, creates request-bound tool adapters and
initializes one private `run` object. Its arrays, counters, receipts and admitted
user-message revision are shared only by that request's helper closures.

`execution.js` validates/deduplicates proposed calls, preserves budgets and
conflict-refresh rules, records audits, invokes exactly the selected adapter and
projects its actual result. `history.js` bounds native provider history and
applies admitted steering messages. `planning.js` chooses/replans within the
existing round/call limits and returns confirmed results. `calendar-context.js`
compacts already-observed Calendar receipts without losing saved identities.

Install helpers before initializing request state, and invoke planning only after
initialization. Keep cancellation and post-audit steering checks in place. No
helper may fabricate a receipt, retry an uncertain write, fetch a second service
implicitly or broaden source permissions.

Read deduplication is local to each adapter. A successful/partial or uncertain
write allows a later model-selected fresh read. Only definitely rejected
read_required/conflict action signatures may be retired after an actual successful
read; successful and uncertain write signatures remain protected. This is cache
bookkeeping, not an automatic read/write workflow, and does not weaken backend
version/permission checks or the existing conflict-refresh bound.
