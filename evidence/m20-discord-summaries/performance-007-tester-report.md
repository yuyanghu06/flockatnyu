# M20 migration 007 independent tester report

- Milestone / role / scope: **PASS for local 007 compatibility and performance regression checks.** Independent tester; changed only tests/discord-summary-sql.test.mjs and new performance-007 evidence. No implementation, applied migration, shared journal, cloud, credential, model, deployment or child-agent actions. Prior 211/calendar evidence remains intact.
- Starting state and files inspected: project instructions, milestones/to-do, tester/report requirements, accepted calendar-retention tests, immutable 006, proposed 007, summary store/runner and root's hosted-summary-plan-before-007.json. Root reported that hosted 006 preview reached its 60-second statement timeout without generating summaries or pruning originals; this tester made no hosted call.
- Work performed: all current summary SQL fixtures now apply seven genuine migrations. Added complete before/after function-output and canonical-input comparison across lifecycle states. Enriched the archive fixture to exactly 104,000,000 bytes of JSON payload while preserving 5,659,472 bytes of extracted text. Captured analyzed local old/new internal plans and added a regression against materializing full-original composites. Existing calendar/name/ACL/lineage/budget/prune tests remain enabled.
- Decisions and assumptions: opaque synthetic nonce metadata supplies the extra payload width without inventing text evidence or images. ANALYZE runs only in the local fixture to reproduce the hosted planner's estimated-source distribution. Plain EXPLAIN establishes plan shape, not observed loop counts or measured old hosted disk traffic. Existing timeouts and memory budgets were not changed.

## Executed checks

| Exact command | Actual result | Evidence |
| --- | --- | --- |
| node --test --test-name-pattern='007 preserves' tests/discord-summary-sql.test.mjs | Exit 0; 1/1 passed, five before/after lifecycle comparisons | performance-007-parity-tests.log |
| node --test tests/discord-summary-sql.test.mjs | Exit 0; 22/22 passed with seven migrations and 104 MB fixture | performance-007-sql-tests.log |
| node --test --test-concurrency=1 tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs | **Exit 0; 212/212 passed**, 64.0 seconds; includes final plan regression | performance-007-integrated-tests.log |
| npm run build:api | Exit 0; API syntax/runtime dependencies verified | performance-007-api-build.log |
| git diff --check | Exit 0 | performance-007-diff-check.log |
| shasum -a 256 supabase/migrations/202610120006_discord_memory_summaries.sql supabase/migrations/202610120007_discord_summary_planning_performance.sql | Exit 0; hashes below | tool output and pinned 006 test |

006 remains b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d.
Tested 007 is 2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b.

## Equivalence and regression proof

For each of five states—originals, published/cache, mixed monthly raw plus verified records, partial monthly crossing-week tail, and closed-month post-prune cache—the test compares all returned columns of manifests for bootstrap/weekly/monthly at five dates: **75 complete manifest cases**. Arrays, full input references, fingerprints, counts, readiness, periods and cached job UUIDs deep-equal before and after 007.

Canonical original and surviving verified-summary objects also deep-equal. A claimed mixed job supplies three real paginated input pages; returned canonical text, segments, citation IDs, names and represented counts remain identical across replacement. Public RPC argument/result signatures, function attributes/ACLs, other helper bodies, table RLS/ACL metadata and fixture role settings remain identical. The applied 006 file hash is pinned in the executed test.

All calendar protections, cross-month tail consolidation, missed older-prefix/new-source automatic catch-up, authoritative channel name/ID handling, normal/cached/superseded finish metadata, lease/policy/source/ACL rejection, full coverage, rollback, post-prune retrieval/cache, scoped reset and collector no-resurrection checks execute against 007. The 64-child reducer cap and exact cost/request-budget guards remain passing.

The local analyzed 006 plan reproduces one full-original Materialize node: estimated 11 rows, width 1769, including m_3.* under the eligible-source join. The optimized plan contains zero such nodes, and the regression asserts that absence. This matches the hazardous shape in root's hosted plan (estimated 15 rows, width 1693). Both plans are plain EXPLAIN: repeated replay counts are inferred from shape/cardinality, not independently observed execution counts.

Plan evidence: performance-007-scale-before-plan.json, performance-007-scale-after-plan.json and performance-007-scale-explain.txt. The old calendar plans were not overwritten.

## Final representative timings

Dataset: 108836 originals, 216 eligible sources/213 nonempty, 779 raw groups, exactly 104 MB JSON payload, 5.66 MB extracted text, 1769 protected current-week originals and zero vectors. Planning yields 695 groups representing 107067 eligible originals. Final integrated measured values:

| Operation | Elapsed | Unchanged budget |
| --- | ---: | ---: |
| Raw group rebuild | 2094 ms | 60s function /65s store |
| Optimized preview | 9969 ms | 60s /65s |
| Begin operation | 11785 ms | 60s /65s |
| Idempotent repeated begin | 10203 ms | 60s /65s |
| Largest-group fingerprint | 452 ms | 12s ordinary store RPC |
| Largest-group publication/prune | 700 ms | 60s /65s |

The largest group represents and prunes 6397 originals through 83 maps and 3 reducers, with 86 injected-provider reservations. Exactly one active certificate remains, consumed temporary content is absent, 102439 originals remain and raw memory bucket counts are consistent. No real model request was made.

- Findings / failures / unavailable checks: no unresolved local material finding. The wider fixture still passes the existing budgets; it does not prove hosted runtime success or actual disk-spill volume. No old full-scale execution/replay timing, hosted apply/readiness, real summary quality, production pruning or independent concurrent Postgres-session race is claimed.
- Acceptance verdict and remaining work: **PASS local 007, 212/212 integrated plus API build/diff.** Root/evaluator must confirm actual hosted preview/begin/publication timing after the separately reviewed migration before model pilot or live compaction.
- Folder-guide updates needed: orchestrator should record seven-migration compatibility, widened payload regression and the distinction between plain-plan estimates and hosted execution evidence.
- Handoff: evaluator can review the final local proof; orchestrator owns journal acceptance and any authorized hosted action. Preserve immutable 006 and the prior 211/calendar reports.
