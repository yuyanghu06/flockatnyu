# M20 migration 008 independent tester report

- Milestone / role / scope: **PASS for the narrow local planning-budget change.** Tester changed only tests/discord-summary-sql.test.mjs and new performance-008 evidence. No implementation, applied migration, journal, hosted, model, credential, deployment or child-agent actions. Existing calendar/007 reports and scale artifacts remain intact.
- Starting state and files inspected: project/tester/report instructions, milestone/to-do, accepted 007 evidence, new 008 and summary-store changes. Root reported an actual hosted 007 preview timeout; this tester did not execute hosted requests. Scope is planning SQL 180s/HTTP 185s, with publication SQL 60s/HTTP 65s and ordinary HTTP 12s unchanged.
- Work performed: updated lifecycle fixtures to apply eight genuine migrations; added whole-catalogue before/after proof and immediate signal/deadline tests. Updated expected planning-only budgets. The archive-scale test remains available with eight-migration setup and new artifact names, but was explicitly excluded from this budget-only pass.
- Decisions and assumptions: reuse accepted immutable 007 wide-payload performance evidence because 008 changes no function body or planning algorithm. Injected AbortControllers exercise deadline/caller cancellation immediately, without sleeping 185 seconds or calling a network/model.

## Executed checks

| Exact command | Actual result | Evidence |
| --- | --- | --- |
| node --test --test-skip-pattern='representative108836' tests/discord-summary-sql.test.mjs | Exit 0; **23/23** passed, 6.1 seconds | performance-008-sql-tests.log |
| node --test --test-concurrency=1 --test-skip-pattern='representative108836' tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs | Exit 0; **213/213 selected checks** passed, 20.8 seconds | performance-008-integrated-tests.log |
| npm run build:api | Exit 0; API syntax/runtime dependencies verified | performance-008-api-build.log |
| git diff --check | Exit 0 | performance-008-diff-check.log |
| shasum -a 256 supabase/migrations/202610120006_discord_memory_summaries.sql supabase/migrations/202610120007_discord_summary_planning_performance.sql supabase/migrations/202610120008_discord_summary_planning_budget.sql | Exit 0; hashes below | tool output and executed immutable-file assertions |

The representative108836 archive-scale case was excluded by the named filter; it is not counted as executed. All other Discord and assistant/backend checks ran. Accepted 007 scale evidence remains in performance-007-tester-report.md and its unchanged logs/plans.

## Exact scope proof

The test applies 001–007, snapshots the complete public pg_proc metadata plus function body hashes/configuration, table metadata/RLS/ACLs, column definitions, constraints, fixture roles and global statement_timeout/work_mem settings, then applies 008.

The complete post-migration snapshot equals the original snapshot after allowing **exactly these two changes**:

- discord_summary_preview: statement_timeout=60s →180s.
- discord_summary_begin_operation: statement_timeout=60s →180s.

All bodies, argument/default/result signatures, ownership, invoker/other function attributes and execution privileges remain identical. Tables, columns, constraints, RLS, roles and global settings remain identical. Both planning functions retain work_mem=16MB; finish remains statement_timeout=60s and work_mem=16MB. Existing browser denials and service privileges remain intact.

Adapter spies establish 185000ms only for preview/begin, 65000ms for finish and 12000ms for ordinary RPCs. Pre-aborted callers produce aborted without fetching or creating a deadline. In-flight parent abort reaches the combined fetch signal and returns aborted for planning, finish and ordinary calls. Manually expiring a planning deadline aborts its fetch and returns unavailable while the parent stays un-aborted. These execute without wall-clock waits. Runner default 600000ms runtime, $1 invocation cap and $5 operation cap remain unchanged.

## Lifecycle regression evidence

Eight-migration fixtures retain current NY calendar-week raw across DST/month boundaries, consolidate the protected tail into one monthly result at the next/later slot, and catch newly available old history. Names/IDs remain authoritative through normal/cached/superseded publication results. Coverage, dependency/policy/source/lease rejection, atomic rollback, original/revision/temp cleanup, post-prune reads/cache, reader ACLs, source-scoped reset, greater-than-ten routine pauses, exact-cap free cached completion and collector no-resurrection all pass. The retained 007 full-manifest/canonical-input equality cases also remain passing.

## Tested immutable identities

- 006: b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d.
- 007: 2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b.
- 008: 3c6b88d3cc93b64364a0f12821e3525079049030604bf8aceea04832e1fbc1ad.

The executed catalogue test pins 006/007 hashes and confirms they remain unchanged.

- Findings / failures / unavailable checks: no unresolved local material finding. No full archive-scale rerun under 008, real timeout-expiry wait, live database cancellation, hosted 180-second runtime success, real model result, cost or production prune is claimed.
- Acceptance verdict and remaining work: **PASS local 008: 23 SQL/213 selected integration checks plus API build/diff.** Root must separately prove actual runtime API preview and begin with zero model dispatch before its authorized pilot. Longer deadlines alone do not establish that hosted planning completes.
- Folder-guide updates needed: orchestrator should document the planning-only 180/185-second budget, unchanged finish/ordinary/model/runtime caps and explicit reuse of 007 scale evidence.
- Handoff: evaluator can accept the local proof; orchestrator owns journal acceptance and any authorized hosted migration/API action.
