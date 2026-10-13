# Discord memory publication performance pass

- Milestone / role / scope: M18 / coder / follow-up to the hosted classification timeout after full history collection. No hosted mutations or deployment.
- Starting state and inspected files: applied migrations 001–003, especially period/rebuild RPCs, policy guards and the shared persistence lock; current milestone/to-do snapshot; independent `tests/discord-memory.test.mjs` scale fixture and `performance-tests.log`. Migration 003 was already hosted and remains unchanged; migration 004 remains unapplied pending independent acceptance.
- Changed files: new `supabase/migrations/202610120004_discord_memory_rebuild_performance.sql` and this report only.

## Final implementation

The replacement RPC retains its signature, JSON result shape, invoker security,
service-only execution, policy row `FOR SHARE`, revision/pause checks, time
validation and `discord-memory:<guild>` transaction advisory lock. It atomically
replaces the guild's published buckets and memberships without model calls or
changes to raw messages, exclusions, source ACLs or other guilds.

Eligible source/channel pairs are materialized before scanning originals, so the
recursive ancestry guard runs once per candidate source. New York calendar
expressions exactly match the existing period helper but execute directly in the
set query, avoiding a separate SQL function call per message. Guild/channel identity
checks keep malformed foreign records out of both counts and membership.

Classification and a random candidate UUID are materialized for each original.
A partitioned `first_value` window then assigns every original in a source/tier/
period group the same stored UUID. Both bucket and membership inserts use that
assigned ID. A scalar aggregate dependency executes parent bucket publication once
before inserting memberships. No original-to-bucket join remains. The volatile
UUID is evaluated before materialization, so the window reads stored values rather
than reevaluating UUID generation.

Existing source/date message and bucket/member indexes remain sufficient. No new
index, planner setting, role privilege, `ANALYZE` requirement or timeout change is
introduced.

## Reproduced failure and plan evidence

The first draft passed a uniformly distributed, analyzed 108,828-row fixture at
roughly 2 seconds, but independent testing exposed a 30,001.5 ms rebuild with fresh
statistics and concentrated sources: 50,000 messages in one source, 25,000 in
another and remaining records distributed over the other 214 sources.

Full `EXPLAIN (FORMAT JSON)` on that exact un-analyzed fixture showed estimates of
one classified row and one inserted bucket. PostgreSQL chose a nested loop joining
the complete classified CTE to the complete inserted-bucket CTE, amplifying work
across originals and groups. This invalidated the first draft's performance claim.

The final full-CTE plan on the same skewed/stale-statistics fixture still estimates
one row, but the member insert now contains an `InitPlan` aggregate over inserted
buckets and a single CTE scan over assigned originals. There is no grouped/
classified nested loop. Remaining nested loops resolve source rows through the
channel primary key and message source/date bitmap index; they do not rescan the
complete group set for every original. UUID assignment uses `Sort` + `WindowAgg`.

```text
CTE assigned: WindowAgg -> Sort -> CTE Scan classified
CTE inserted_buckets: ModifyTable -> Aggregate -> CTE Scan assigned
CTE inserted_members: ModifyTable
  InitPlan 5: Aggregate -> CTE Scan inserted_buckets
  Result -> CTE Scan assigned
```

## Actual checks

- `node --test --test-name-pattern='representative 108828' tests/discord-memory.test.mjs`: the unchanged independent scale fixture passed. First publication **1,940.4 ms**, repeat **2,093.0 ms**, each producing **3,139 groups** and **108,828 memberships**. Seed and assertions made the complete test 9,843.7 ms. This is approximately 15.5 times faster than its previously failing first publication, under the existing 15-second fixture budget and without `ANALYZE`.
- That fixture verifies exact daily/monthly/weekly totals, one membership per valid original, zero foreign or denied-source memberships, exact source/period consistency, repeated grouping and preservation of previous publication after invalid/stale requests. It also includes three direct malformed/denied records outside the 108,828 valid originals.
- Separate `node --input-type=module` PGlite fixture before the final membership-plan correction applied all four migrations and checked 33 timestamps covering both DST transitions, month rollover, exact 168-hour cutoff ±1 ms and `as_of` exclusion against `discord_memory_period`. All inline calendar expressions matched; those expressions were unchanged by the final correction. Invoker and service-only ACLs remained unchanged.
- Full `EXPLAIN (FORMAT JSON)` was rerun after the correction using the independent seed, all four migrations and default fresh statistics; the final plan structure is described above.
- `node --test tests/discord-memory.test.mjs`: final **18/18 passed**, including all four migrations and actual rebuilt cutoff/month/23–25-hour DST bucket assertions. Scale publication timings in this complete run were 2,021.8 ms and 2,265.8 ms; zero skips/failures. The whole suite took 14,335.6 ms.
- `git diff --check`: passed.

## Handoff and limits

PGlite executes PostgreSQL in WASM. The timing demonstrates a representative local
improvement and removal of the reproduced planner amplification, not guaranteed
hosted latency. Independent tester/evaluator should accept the final file, then the
orchestrator can journal this pass, apply migration 004 as a new hosted migration,
rerun classification against retained originals and verify all hosted counts,
permissions and calendar coverage. Root owns folder guides and shared journals.
