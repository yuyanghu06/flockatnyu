# M20 planning-only runtime budget coder pass

- Milestone / role / scope: bounded M20 coder follow-up; extend only summary preview/operation-creation runtime after native hosted evidence. No helper, canonical, cache, calendar/name/lineage, model cost, concurrency or runner runtime changes.
- Starting state and inputs: coder/report instructions, current milestones/to-do, parent planner brief, applied006/007 and summary-store. Root reports007 preview still failed after60,824ms; no model calls or pruning occurred. Native512-record EXPLAIN ANALYZE measured canonical383.712ms, control122.871ms, extra-text212.326ms and component-link216.071ms. These measurements are root's read-only evidence, not coder cloud actions.
- Changed files: new `supabase/migrations/202610120008_discord_summary_planning_budget.sql`, one timeout-selection line in `server/discord/summary-store.js`, and this report. Preserve all other edits. No children, cloud/schema writes, credentials, model calls, deployment or shared guide/journal changes.

## Implemented change

008 uses only two exact `ALTER FUNCTION` statements: preview
`(text,text,text,text,text,timestamptz)` and begin_operation
`(text,bigint,text,text,text,numeric,integer,text,timestamptz,text)` receive
`statement_timeout='180s'`. The schema reload notification refreshes PostgREST's
function metadata. Their existing16MB work_mem, bodies, invoker/service-only ACLs
and all other configuration remain intact. No role/global timeout or ownership
change occurs.

The server adapter gives only preview/begin185,000ms HTTP deadlines. Finish stays
65,000ms, ordinary RPCs12,000ms; caller cancellation remains combined with the
deadline through `AbortSignal.any`. Finish SQL keeps60s. Paid request/cost caps,
provider timeouts/retries, concurrency and the existing600-second run budget are
unchanged.

## Evidence and inference

The real post00760-second planning failure is observed. Scaling the measured
512-record canonical sample linearly to107,067 eligible originals gives roughly
80seconds, which is an inference only: it excludes whole-manifest grouping,
serialization, operation insertion, I/O variation and CPU contention. The180-second
planning budget comes from the bounded planner decision and gives headroom for
those costs; it is not a claim that full hosted planning has completed. Root must
measure actual preview AND begin after008 before a model pilot or deletion.

## Executed checks

- `node --check server/discord/summary-store.js`: passed.
- Executed Node/PGlite/pgvector fixture applies migrations001–008 and snapshots
  every public function body hash, identity arguments/result, volatility, invoker
  status, ACL and configuration; table owner/RLS/ACLs; anon/authenticated/service
  role settings; and relevant session settings. Exact comparison permits only
  the two specified60s→180s function settings. All other properties, including
 16MB work_mem, are unchanged. Passed.
- Executed controlled server-adapter fixture records185000/185000/65000/12000
  for preview/begin/finish/get-operation and verifies caller abort both before
  dispatch and during a synthetic in-flight request. Passed without waiting for
  a real deadline or making any network/model request.
- Applied migration hashes verified unchanged:
 006 `b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d`;
 007 `2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b`.
 008 SHA256 `3c6b88d3cc93b64364a0f12821e3525079049030604bf8aceea04832e1fbc1ad`.
- Independent `node --test --test-skip-pattern='representative108836' tests/discord-summary-sql.test.mjs`:23/23 passed in6.1seconds. Exact whole-catalogue comparison allows only the two function timeout changes; full pg_proc bodies/signatures/ACLs, table columns/constraints/RLS and role/global settings remain identical. Deadline spies verify185000/65000/12000, pre/in-flight caller abort and controlled manual deadline cancellation without waits. All calendar/lineage/publication/prune fixtures apply008. Evidence `performance-008-sql-tests.log`.
- Final broad integration/evaluator acceptance is owned by root/tester. No actual
  hosted008 application or runtime is claimed. The unchanged computation retains
  the separately accepted007 wide-payload performance evidence; it was not
  unnecessarily rerun for this settings-only change.

## Verdict, limits and handoff

The exact planning-only budget adjustment is implemented and coder-local checks
pass. Files are stable for independent acceptance, then root-only apply and real
preview/begin timing. A second timeout must be treated as measured failure rather
than proof to keep enlarging limits; no runtime/provider/model-cost budget was
raised by this pass.

Root owns folder-guide/journal updates: distinguish planning180/185s from
publication60/65s and ordinary12s, retain the actual-vs-extrapolated timing
distinction and update the applied-migration inventory only after application.
No originals, citations, summaries, permissions or source state were modified.
