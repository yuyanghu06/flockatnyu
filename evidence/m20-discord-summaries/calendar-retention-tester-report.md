# M20 calendar retention independent tester report

- Milestone / role / scope: **PASS for local calendar-retention acceptance.** Independent tester; only assigned tests and new calendar-retention evidence changed. No implementation, shared journal, cloud, model, credential or child-agent actions. Earlier baseline and rolling-retention reports/logs are preserved as prior-scope evidence.
- Starting state and files inspected: AGENTS.md, milestones/milestone.md, milestones/to-do.md, workflow/tester/report instructions, prior retention planner/report, current runner/provider/scheduler/CLI/store, and genuine migrations 001–006. Latest user instructions supersede the rolling 168-hour cutoff: current New York Monday–Sunday week stays raw, summaries remain per channel, with names alongside IDs.
- Work performed and changed files: adapted tests/discord-summary-schedule.test.mjs, tests/discord-summaries.test.mjs and tests/discord-summary-sql.test.mjs. Added calendar-retention logs, current internal SQL plan and this report. Existing unrelated tests and all old evidence remain intact.
- Decisions and assumptions: New York calendar boundaries drive retention; scheduled 08-hour startup freezes 08:00 asOf. The 1st consolidates only prior-month content before the current week's Monday 00:00, preserving the crossing-week tail. The following Monday folds that tail and its verified monthly prefix into one monthly result. Later routine slots catch missed older prefixes and newly discovered older history. No daily model summaries. Synthetic local providers exercise storage/coverage/accounting without real inference.

## Executed checks

| Exact command | Result | Evidence |
| --- | --- | --- |
| node --test tests/discord-summaries.test.mjs tests/discord-summary-schedule.test.mjs tests/discord-summary-provider.test.mjs | Exit 0; 54/54 passed | calendar-retention-runner-tests.log |
| node --test --test-name-pattern='genuine006\|SQL calendar' tests/discord-summary-sql.test.mjs | Exit 0; 17/17 passed on final normal/cached/superseded metadata fields | calendar-retention-lifecycle-tests.log |
| node --test tests/discord-summary-sql.test.mjs | Exit 0; 20/20 passed before the added missed-older-prefix case; final integrated run includes that case | calendar-retention-sql-tests.log |
| node --test --test-concurrency=1 tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs | **Exit 0; 211/211 passed** on final code, 57.4 seconds | calendar-retention-integrated-tests.log |
| npm run build:api | Exit 0;  API syntax/runtime dependencies verified | calendar-retention-api-build.log |
| git diff --check | Exit 0 | calendar-retention-diff-check.log |

The wildcard includes all 13 Discord test files, including the new schedule and genuine SQL summary fixtures. Serial file execution avoids competing archive-scale timing runs. The integrated command also covers the three assistant/backend suites.

## Calendar, identity and lifecycle coverage

Schedule tests establish NY Monday 00:00 protection, Sunday tails, month/year boundaries, UTC 12/13 DST 08:00 gates and delayed 08:37 fixed snapshots. Consecutive spring/fall calendar weeks span 167/169 hours. Genuine SQL tests preserve both repeated 01:30 fall instants as current-week raw and publish the completed 167-hour spring week correctly. No daily mode or ordinary-day model dispatch is accepted; monthly wins on Monday the 1st, while pending work can resume outside the normal gate.

The real six-migration lifecycle initially preserves current-week originals, then compacts the completed week. On November 1 it consumes verified weekly records and older raw into an October monthly prefix while October 30 stays raw. November 3 folds that protected tail and prefix into exactly one final October monthly result per channel, deletes the superseded body and leaves disjoint active ranges. A missed October prefix is also completed at a December routine weekly slot. A newly available source collects old history normally, waits for complete discovery/checkpoints, then receives a historical monthly result at a routine weekly slot without manual bootstrap.

Channel labels derive from the trusted channel registry, paired with source/channel IDs. Canonical inputs ignore spoofed raw-row/message names. Model contexts, result reads, persisted collector names and normal/cached/minimal-superseded finish responses retain the trusted name/ID pair. Renaming a leased source invalidates publication. Canonical fingerprints also change for author/reply/extracted-text/component-URL changes.

Genuine tests verify eleven forced-RLS summary/ledger tables, invoker/service-only functions and denied browser access; no automatic reader grants. Stored results require trusted source scope and durable member/source grants, paginate without duplicate rows and remain readable after raw pruning. Pause, blacklist, disabled/inactive source, expired lease, changed raw/dependency hash, inactive child ledger and overlapping raw/represented coverage reject publication without changing source content.

Refusal and incomplete coverage preserve originals. An injected AFTER DELETE exception rolls back result, ledger and prune together. Resume reuses successful parts, including reordered JSON cache data. Successful publication removes consumed originals/revisions/input/map/reduce/weekly bodies and repairs raw memory counts, while keeping minimal certificates/dependencies and charged request accounting. Stale overlapping monthly jobs lose temporary content after verified replacement. Greater-than-ten normal budget pauses resume safely; an exhausted exact request/cost cap still permits free cached finalization. Terminal retry dispatches nothing.

Compacted overlap/late collector pages cannot resurrect deleted originals, retain boolean RPC compatibility and advance checkpoints; an actually different stale CAS fails. Foreign existing message identity is checked before a compacted-range skip. Missing/unfinished/old-revision discovery and empty incomplete sources report wait_for_sync; genuinely completed all-excluded scope is a harmless no-op. Reset preserves another guild's retained result, operator, channel configuration and grants.

## Final representative performance evidence

The local archive contains 108836 originals, 216 eligible sources (213 nonempty),779 raw memory groups,5,659,472 extracted-text bytes and 0 embeddings. It preserves 1769 current-calendar-week raw records and plans 695 eligible retention groups representing 107067 originals. The largest monthly group contains 6397 originals.

| Operation | Final integrated elapsed | Existing budget |
| --- | ---: | ---: |
| Raw group rebuild |1884ms |60s function /65s store |
| Summary preview |9459ms |60s /65s |
| Begin operation |11090ms |60s /65s |
| Idempotent repeated begin |9672ms |60s /65s |
| Largest-group fingerprint |429ms |12s ordinary store RPC |
| Largest-group certified publication/prune |665ms |60s /65s |

Largest-group processing used 83 maps and 3 reducers, with 86 injected-provider reservations. All 6397 originals were represented once and pruned, leaving 102439 originals, one active certificate, no consumed temporary content and consistent remaining raw buckets. Every model context retained its source/channel ID and authoritative name. No vectors were created.

Earlier scale inspection found repeated whole-manifest aggregation under inaccurate statistics; materializing it removed that amplification without increasing budgets. The earlier 72-child reducer defect is resolved by the root's 64-child batch cap. The dedicated 65-map cache-resume regression and the real 83-map publication both pass. Prior failure evidence remains in retention-* logs/plans; the current plan is calendar-retention-scale-explain.txt.

- Findings / failures / unavailable checks: no unresolved local material finding. The calendar CAS fixture was corrected to advance its watermark from November 3 to November 4, making the stale assertion meaningful. Normal/cached/superseded finish metadata initially lacked channel ID and was corrected by storage; explicit final tests pass. Local fixtures do not establish hosted latency, actual model quality/cost, physical production storage reduction, Railway operation or concurrent independent Postgres-session races.
- Acceptance verdict and remaining work: **PASS local implementation/acceptance,211/211 plus API build and diff check.**006 remains unapplied by this tester, and no real summary or production prune is claimed. Root owns hosted readiness/performance, bounded factual/citation/usage pilot review, verified atomic commit and live scheduling before overall deployment acceptance.
- Folder-guide updates needed: orchestrator should document calendar-week protection, month-tail consolidation, authoritative names/IDs, new test coverage and preserved superseded evidence in affected info.md guides.
- Handoff and recommended next action: evaluator can accept the final local evidence; orchestrator must journal this pass before live rollout. Preserve separate daily collection and existing permission/image/embedding boundaries.
