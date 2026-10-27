# Closed-task read cleanup contract accepted

- Local timestamp / acting role / milestone: 2026-10-26T18:46:29.909895-04:00 / planner / resolved-read cleanup.
- Requested scope: complete the existing authorized removal of unused conversation entries.
- Starting repository state: selected fixes pushed, source currently unchanged; manual159accepted removals and journals dirty.
- Work performed / changed files: read-only compactor/handler/snapshot/test and content-free cycle25 review confirms unique source/target reads for closed tasks are retained; copied observation handoff only removes superseded reads.
- Decisions: retire only trusted successful follow-up reads whose nonempty canonical saved-task bindings ALL resolved after that read and are absent from the current live snapshot. Preserve exact structured dependencies of all disclosed unfinished tasks, broad uncertain target coverage, queue/mixed/open/unknown scopes, post-close readbacks, failures, receipts and fragment/history bodies. Apply the same rule by exact call provenance to copied observations. No natural-language dependency guesses, source reads or new limits.
- Checks and evidence: planner ACCEPT bounded contract; no tests or mutations. Private execution-log cap is separate; receipt alone does not identify which context cap stopped25.
- Resulting state / acceptance: root accepted plan; coder assigned only conversation-context.js, focused tests and automation guide. Root journals; independent verification/review follow.
- Remaining work and handoff: implement/test/evaluate, resume smaller manual groups with verified code, final push and private-file cleanup.
