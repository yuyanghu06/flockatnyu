# M20 independent sliced-planning tester report

- Milestone / role / scope: M20 independent tester; bounded source/period planning, calendar retention, authoritative channel names/IDs, permissions and durable spending recovery. **PASS for local acceptance.** No implementation, shared journals, hosted calls, credentials, models or deployments were performed by this tester.
- Starting state and files inspected: AGENTS.md, milestone/to-do snapshot, tester role/report template, sliced-planning brief, runner/storage contracts, migrations001–009, summary-store/runner/CLI and previous acceptance evidence. Hosted001–008 remain immutable.
- Changed assigned files: `tests/discord-sliced-planning.test.mjs`, its fixture utility, existing summary SQL/runner tests, and this pass's `sliced-planning-*` artifacts. Earlier reports/logs remain preserved.
- Decisions and assumptions: genuine isolated PostgreSQL via PGlite, actual storage adapter with local RPC transport, and injected no-network providers. Metadata-only preview preserves unknown canonical counts as null. Replanning a charged operation preserves its ID, prior reservations, request/spending counters and original caps. Zero-paid poisoned generations may retire without becoming eligible for model dispatch.

## Executed final checks

- `node --test tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs`: exit 1, 233/234 passed in 41.23 s. Every new recovery/security case and the full representative scale passed. The sole failure was an old test expecting zero requests after a stale edit; the newly authorized automatic recovery correctly prepared fresh evidence and dispatched one bounded map. Before-update evidence is preserved in `sliced-planning-integrated-before-fixture-update.log`.
- Updated only that obsolete fixture: now verifies one replan, one fresh request, zero premature groups/prune, unchanged operation ID/frozen due identity, eventual deletion of old cached content, and more than ten safe bounded pauses. `node --test --test-name-pattern='stale monthly cached' tests/discord-summary-sql.test.mjs`: exit 0, 1/1 (`sliced-planning-obsolete-fixture-retest.log`).
- `node --test --test-skip-pattern='representative108836' tests/discord*.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs`: exit 0, **233/233**, 16.69s (`sliced-planning-final-integrated-tests.log`). Only the already-passed scale was excluded. Implementation SHA remained unchanged; an assertion-only fixture correction did not justify repeating all 695 slices.
- `npm run build:api`: exit 0, API syntax/runtime dependencies verified (`sliced-planning-final-api-build.log`). `git diff --check`: exit 0.
- Final009 SHA256: `7466b2e1871d20a8c5752f0a1186802e880091353da89a7c69eaffbb4c95b59f`. Applied006/007/008 hashes remain respectively `b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d`, `2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b`, `3c6b88d3cc93b64364a0f12821e3525079049030604bf8aceea04832e1fbc1ad`.

## Bounded archive performance

Latest final implementation fixture contains 108836 originals,216 eligible/213 nonempty sources,779 raw groups,104000000 bytes of JSON payload and5659472 extracted text bytes. Calendar-protected current-week raw count is 1769 with correct source-derived names; vectors remain 0.

| Executed operation | Local elapsed |
| --- | ---: |
| Metadata preview | 707.1ms |
| Begin / repeated begin | 715.6 / 710.0ms |
| All695 cursor preparations | 16885.7ms |
| Largest 6397-original period preparation | 727.6ms |
| Slowest / final slice including finalization | 747.5ms |
| Largest current fingerprint check | 496.7ms |
| Largest verified publication/prune | 776.7ms |

Every cursor moved exactly once. Before planning completion:0 requests,0 ledgers, all 108836 raw intact. Final plan contained695 jobs. Largest publication used 83 map parts plus 3 reduce parts/86 injected requests, represented and removed exactly 6397 originals, preserved protected current-week raw, removed consumed temporary content and kept raw memory bucket counts consistent. Per-period source/channel/name/tier/count/cursor timing evidence is in `sliced-planning-scale-slices.json`; plans are in `sliced-planning-scale-{before,after}-plan.json` and `sliced-planning-scale-explain.txt`. These are local measurements, not hostedHTTP proof.

## Independently exercised behavior

- Fourteen new genuine009 SQL cases, including 75 complete original007 per-job count/fingerprint/input-reference equality states over raw, verified weekly prefixes, mixed monthly evidence, cache and crossing-month tails. Final operation digest equals original007 sorted canonical digest. Existing calendar/DST/publication/source URL/name/ID/lineage/ACL/reset/no-resurrection tests also passed.
- Audit trap proves metadata preview/begin perform zero canonical extraction calls and return null char/segment counts. The audited preparation canonicalizes only its chosen source/period. Zero-link drafts are visible to pending lookup, incomplete totals cannot report ready, and valid SQL claims/reservations/input reads are blocked until all planning completes.
- Failed input writes roll back jobs/refs/links/cursor atomically. Duplicate cursor CAS remains stale without poisoning the healthy draft. Final roster drift rolls back the entire final slice, persists only its stale flag and removes unpaid obsolete work from pending selection.
- Pause, revision, blacklist, disabled source, incomplete checkpoints, renamed channels, author edits and retained-component URL-only changes fail safely without prune. Payload-only edits with unchanged cheap metadata identity now recover fresh canonical fingerprints through the same due identity. Cached rename retains the exact canonical manifest fingerprint without uniqueness conflicts or paid requests.
- Charged recovery keeps the same operation ID, prior reservation rows, spent/allocated counters and original two-request/$0.00012 limit even when begin supplies larger caps. Only one remaining dispatch is possible. Reserved/uncertain response recovery retains its one-request/$0.00006 allocation; late unknown-usage commitment after replan still works, conservatively consumes that allowance, and permits no remaining dispatch/prune.
- Any stale member blocks new claims/dispatch for the obsolete frozen operation. Automatic runner repair covers explicit operation, default pending work and scheduled continuation outside 08 NY, preserves frozen mode/asOf/due/caps, then drains the fresh queue before model work.
- Service-only invoker helpers, forced RLS/browser denials, scoped reset and unchanged global role settings. Prepare 55 s SQL/60s HTTP; preview/begin/finish60s SQL/65s HTTP; ordinary RPCs 12 s. Parent abort/deadline tests use injected signals without wall-clock waits.
- Legacy008 fully planned operations upgrade with valid jobs/input leases and exact old eight-column operation uniqueness. Canonical/input/save/finish helper bodies and permissions remain unchanged.

## Findings, limits and handoff

Three implementation findings were independently reproduced and fixed: poisoned same-metadata queue recovery (`sliced-planning-payload-recovery-before.log`), exact-due cached rename uniqueness (`sliced-planning-cached-rename-before.log`), and claims bypassing a stale member (`sliced-planning-charged-recovery-before.log`). Final integrated checks close all three. The obsolete old recovery expectation was corrected only after the new behavior and preserved budget were proven.

Earlier executed 59-runner,8-focused,24-retention/scale and226-integrated checks remain preliminary history under their original logs; they are not substituted for final evidence. The focused recovery run also passed13/13 before the final pending/uncertain case; final integrated evidence includes all14.

**Remaining gaps:** no hosted009 application, actualHTTP planning latency, real model factual quality, paid requests, production deletion, cron or deployment acceptance. Root owns those gates. A future period exceeding 55 s could require finer subdivision; local scale does not prove every future period fits. No live summaries or pruning are claimed.

Folder-guide/journal updates are orchestrator-owned. Root should journal this pass before local acceptance, then prove actual hosted preview/begin/largest preparation/all 695 queue completion with 0 models/prunes before the authorized factual/citation/usage pilot.
