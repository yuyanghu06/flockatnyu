# M20 calendar-week/name storage coder follow-up

- Milestone / role / scope: M20 coder; adapt unapplied006 and summary-store to the user's current New York calendar-week raw retention and per-channel name/ID requirement. Preserve applied001–005 and other agents' edits. No children, cloud/schema writes, credentials, deployments, model calls or deletion outside local fixtures.
- Starting state: inspected current milestones/to-do, coder/report instructions, prior retention implementation/reports, source title/persistence contracts and coordinated runner/tester/evaluator assignments. The preceding rolling168-hour retention report is historical and superseded by this pass.
- Changed files: `supabase/migrations/202610120006_discord_memory_summaries.sql`, `server/discord/summary-store.js`, and this report only. Root owns guides/journals/runner integration; tester owns tests/evidence.

## Implemented behavior and decisions

The raw cutoff is New York Monday00:00 for the current calendar week, calculated
by truncating local time before conversion to timestamptz. No elapsed168-hour
cutoff remains in summary planning. Current-week messages stay individual raw
records throughout Monday–Sunday, including the portion in the previous month.
Older completed current-month weeks become source-specific weekly summaries.
Older calendar months become monthly summaries directly.

Monthly intervals end at `min(monthEnd,currentWeekStart)`. If the1st falls within
an existing week, monthly publication retains that crossing-week raw tail and
publishes only the closed prefix. On the following Monday, ordinary weekly work
consumes the prior verified monthly prefix plus disjoint newly eligible raw tail,
atomically replacing it with ONE final monthly result/source/month. Superseded
monthly content is deleted; minimal certificate lineage/count/digest persists.
No current-week raw is included in that deletion transaction.

Recurring weekly/monthly modes also collect ANY newly accessible un-compacted old
history or unfinished old monthly prefix, rather than only the immediately previous
month. This lets automatic thread/source discovery catch up without a manual
bootstrap. Already full closed monthly certificates are excluded from recurring
modes; bootstrap can still report cached history without paid reprocessing.

Raw records now have `channel_name`, populated from authoritative source title
in the guarded persistence RPC, ignoring a caller-supplied name. Migration006
fills only pre-existing current-calendar-week raw names, avoiding a rewrite of the
entire archive. Older canonical evidence receives its source title through the
eligible/source joins. Jobs, certificates and final results seal the generation
name; input/job/readout and store finish mappings expose `channelName` with
`channelId`. Leased processing checks its sealed name against the current source
title, so a rename cannot change model context under cached parts; completed
certificates remain valid without reopening deleted originals.

Existing policy/source/lease/readiness/ACL guards, exact segment/DAG coverage,
lineage/count/disjoint-ledger checks, publish-before-prune rollback, current source
eligibility, scoped reset, no-resurrection and durable conservative cost accounting
are preserved. Expensive manifest aggregation remains materialized once, retaining
the measured planning fix. Function60s/16MB and HTTP65s limits remain scoped to
preview/begin/finish; other RPCs stay12s. No images, embeddings or member grants
were introduced.

## Actual commands and results

- Genuine Node/PGlite/pgvector fixture applies all six migrations with the new
  raw/name schema: passed. An initial invocation used an unavailable vector import
  subpath; corrected it to the repository's actual `@electric-sql/pglite-pgvector`
  package before executing the database check.
- Executed genuine SQL lifecycle, no model calls: completed weekly publication
  processed3raw originals; monthly on2025-11-01 processed a weekly certificate
  plus1raw, represented4 and closed at2025-10-27T04:00Z. The crossing-week
  October30 original remained raw. Following Monday2025-11-03 weekly work
  processed the verified monthly prefix plus that1raw tail, represented5 and
  left exactly one active final October monthly result. Pruned counts3/1/1.
  Canonical inputs/jobs/results retained the authoritative channel name.
- Same-token retries, post-prune explicitly granted reads and compacted late-page
  checkpoint advancement with zero resurrected originals passed. A fresh noncovered
  page carrying an untrusted name stored the authoritative source title instead.
  Final normal/cached finish returns explicitly include trusted channel ID/name;
  the coder reran the complete lifecycle with assertions for both fields on each
  normal and cached response. Minimal superseded cache also includes the same
  sealed job metadata. Independent final focusedSQL17/17 passed normal/cached/
  superseded name+ID assertions, older newly discovered source catch-up and a
  missed October monthly prefix completed during December ordinary weekly work.
- Actual SQL local-calendar conversion assertions passed both DST transitions:
  March8→March2@05Z, March9→March9@04Z, November1→October26@04Z and
  November2→November2@05Z for2026. These are calendar Monday boundaries.
- `node --check server/discord/summary-store.js`: passed.
- Independent `node --test tests/discord-summary-sql.test.mjs`:20/20 passed
  in44.55seconds; evidence `calendar-retention-sql-tests.log`. Calendar/source-name
  lifecycle, new-old-source scheduled catch-up, rollback/coverage/current-policy/
  ACL/reset/no-resurrection guards and exact-budget resumptions all pass.
- Independent same-scale fixture:108,836 originals/216 nonempty fixture sources/
  779 raw groups, selecting695 retention jobs. Preview9,376ms, begin11,210ms,
  repeat9,757ms and largest-job fingerprint435ms. Verified publication/pruning
  of6,397 originals completed in684ms, used86 synthetic model requests, retained
  correct raw bucket counts and deleted temporary processing content. The plan
  still has one materialized manifest aggregate; no budget/fixture reductions.
  These are PGlite timings, not hosted Supabase performance claims.
- Independent initial integrated suite210/210 passed. The tester is rerunning211
  cases after its final missed-prefix/metadata additions; final accepted integrated
  evidence belongs to the tester report and root journal.

## Limits, acceptance and handoff

Assigned calendar/name behavior is implemented and coder-local plus independent
SQL lifecycle/scale checks pass. Final integrated evaluator acceptance and actual
hosted preview/begin/publication proof remain required.006 is still unapplied; no real summaries or
raw pruning are claimed. The root's64-child reducer batching fix is preserved;
SQL continues to enforce that limit.

Pruned original content remains unavailable locally. Monthly processing of a
verified prefix reads its certified summary, not deleted originals; represented
counts and direct-input counts remain distinct. Current-week raw overrides the
calendar-month boundary by explicit user instruction.

Root guide/journal updates: replace rolling-seven-day language with calendar-week
raw retention, document month-prefix/tail completion and automatic old-source
catch-up, and explain name snapshots with stable IDs. Continue independent
calendar/DST/cross-month/name/guard/scale verification, then authorized hosted
budget proof and bounded real generation with physical row/certificate counts.
