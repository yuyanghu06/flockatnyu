# M20 hosted planning performance coder follow-up

- Milestone / role / scope: M20 coder; optimize the hosted summary planning timeout without changing retention or budgets. Own new007 and this report; summary-store permitted only for a justified specific adapter deadline change, which proved unnecessary.
- Starting state:006 is applied as20261011232316 and immutable, SHA256 `b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d`. Its local calendar/name/lineage acceptance passed, but real hosted bootstrap preview exceeded the function60-second limit. Raw108,836 records, zero results/embeddings and current-week name population remain intact according to root's read-only diagnostics.
- Inspected: coder/report instructions, current milestones, applied001–006, calendar reports/tests, canonical/manifest functions and root's actual hosted statistics/EXPLAIN. [PostgreSQL query-planning documentation](https://www.postgresql.org/docs/17/runtime-config-query.html) was consulted; no planner/configuration setting change was chosen.
- Changed files: only `supabase/migrations/202610120007_discord_summary_planning_performance.sql` and this report. No006/store/test/guide/journal edits, cloud writes, model/credential actions, deployment or children.

## Actual finding and bounded fix

Root's actual hosted before-plan is
`hosted-summary-plan-before-007.json`. In the raw branch of the materialized
records CTE, the eligible-source scan estimates72 rows (216 actual sources)
outside a nested loop whose inner Materialize estimates15 rows (107,067 actual
eligible originals), width1,693. The join filter relates window source identity
to that late eligible scan. Its inner tuple contains the complete `m.*` original,
including the hosted aggregate104,174,814bytes of JSON payload. This plan can
replay a large spooled set of complete original rows for every eligible source.
The final manifest GroupAggregate was already materialized; this was a different,
earlier join amplification exposed by real payload width and statistics.

007 carries the already authorized source's authoritative channel name through
raw windows, retained windows and grouped windows. Canonicalization then uses
`discord_summary_input(m,w.channel_name)` directly. The late eligible-source join
is removed entirely. No canonical field, hash algorithm, return column, source
scope, group identity, calendar interval, readiness condition or cache behavior
changes. Existing policy/lease/ACL/lineage/reset/no-resurrection/budget functions
remain untouched. The replacement remains STABLE, invoker and service-only;
permissions are explicitly preserved and PostgREST schema reload is notified.
No timeout, work_mem, role, global configuration, index or adapter change occurs.

Root's read-only EXPLAIN of the proposed body, without applying it, is saved in
`hosted-summary-plan-proposed-007.json`. Its raw branch is now the direct window
to indexed-original nested-loop anti join, followed by the small cached CTE;
the late eligible/full-original Materialize replay is absent. Final manifest
aggregation remains materialized once. Plain EXPLAIN establishes the corrected
shape; actual hosted execution latency remains to be measured after authorized
application by root.

## Executed checks

- `sha256sum supabase/migrations/202610120006_discord_memory_summaries.sql`:
  matches the immutable applied SHA above before and after this pass.
- Genuine Node/PGlite/pgvector fixture applied all seven migrations. It compared
  COMPLETE006/007 manifest rows, including fingerprints and canonical input refs,
  across five mode/asOf cases at four lifecycle states: raw before compaction,
  verified weekly child, monthly prefix plus protected crossing-week raw tail,
  and completed monthly cache. All20 exact comparisons passed.
- With007 active, the same executed lifecycle passed weekly3raw publication,
  monthly prefix represented4 while current-week tail remained raw, following
  Monday replacement represented5, exact atomic raw/temp/obsolete-content pruning,
  same-token normal/cached channel-name/ID returns, explicitly granted post-prune
  reads, authoritative fresh-page names, compacted late-page progress with zero
  resurrection and both New York DST calendar-Monday conversions. Synthetic
  reserved request receipts were used; no model calls occurred.
- Independent007 parity passed in1.6seconds:75 complete mode/asOf manifests
  across five states, canonical raw/verified inputs, mixed-job input pages,
  cached identities and identical function signatures/volatility/configuration/
  ACLs, non-manifest helper bodies, tables and role settings. The fixture asserts
  the applied006 SHA remains unchanged. Evidence `performance-007-parity-tests.log`.
- Independent `node --test tests/discord-summary-sql.test.mjs`:22/22 passed in
 48.77seconds, applying all seven migrations for lifecycle/guards/parity. The
  enriched representative fixture has108,836 originals,104,000,000 payload bytes,
 216 eligible/213 nonempty sources,1,769 protected current-week originals,
 779 raw groups and695 retention jobs. Preview9,916ms, begin11,509ms,
  repeat10,109ms, largest-job fingerprint449ms and verified6,397-original
  publication/pruning687ms. Exact processing used83 maps+3 reductions/86
  synthetic requests; scopes, coverage, raw counts and temporary cleanup passed.
  Evidence `performance-007-sql-tests.log` and before/after enriched-fixture plans.
  Root/evaluator own final review and actual hosted RPC proof; this report does
  not claim hosted runtime success.

## Acceptance, limits and handoff

The measured harmful join is structurally removed, exact coder-local and independent
semantics pass, and enriched-payload local RPCs fit the existing budgets. Proposed007 SHA256 is
`2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b`.
The migration is ready for independent testing/evaluation, then root-only apply
and hosted preview/begin timing. A successful plain plan alone does not prove
that native canonical CPU or I/O fits the unchanged60/65-second limits.

Folder-guide/journal updates belong to root: record the hosted-only planning
finding, immutable006 and bounded007 correction, preserving the distinction
between local parity, hosted plan and hosted runtime evidence. Model generation
and verified pruning remain a separate authorized stage after planning passes.
