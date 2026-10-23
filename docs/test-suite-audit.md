> Subsequent [current-rule phase-out](test-phaseout.md) records32additionalcase removals and the latest inventory; this report remains its original dated snapshot.

> This is the pre-cleanup audit. The subsequent [cleanup report](test-suite-cleanup.md) and [after-cleanup inventory](test-suite-inventory-after-cleanup.csv) record the applied removals and current results.

# Repository test-suite audit — October 22, 2026

Audited the current tracked and untracked repository source, excluding dependencies, build output, ignored evidence and generated local state. This audit changed documentation only; no tests were deleted or repaired.

## Counts and counting rules

- **2,459 individual registered Node test cases across 168 `.test.mjs` files.** Node reports **2,499 tests** because that total also includes **40 parent tests** containing named subtests. Some parent tests contain their own setup/assertions; both counts are provided rather than silently mixing them.
- **147 individual historical/retired-feature cases across 15 mixed or historical files**, plus 13 parent tests: 160 reported results under the same counting convention as Node. Five individual cases in those mixed files still test current code.
- **13 individual Node cases can be removed conservatively:** eight exercise retired JavaScript fixtures only, and five are duplicate no-Miro variants. This is a recommendation, not an applied change.
- **54 standalone validation scripts** also live under `tests/`, outside the default Node suite. They include browser acceptance, geometry/navigation checks, optional model exercises and capture tools. Thirty-one scripts use a consistent named `check(name, callback)` pattern: 312 call sites expand to 347 checks with their fixed loops. Other scripts use inline assertions, scenario arrays or no assertions, so 347 is not a total for all 54 scripts. There is no single honest additional case total without first standardizing those scripts.
- **Seven legacy browser harnesses contain 56 of those named checks.** These are additional to the 147 historical Node cases: 203 explicitly identified historical cases/checks across the two systems. Their unique useful checks must be preserved before deleting the old harnesses.
- Shared fixture modules, ordinary `assert` statements, SQL statements and repeated selection of the same model scenario are not counted as independent cases.

The exact file-by-file Node inventory is [test-suite-inventory.csv](test-suite-inventory.csv). Count reconciled at 2026-10-22T18:26:43-04:00; this working tree was being edited concurrently.

## What the tests do

Each file is assigned one primary area for counting; many integration cases cross areas. These counts include historical tests.

| Area | Files | Individual cases | High-level coverage |
| --- | ---: | ---: | --- |
| Autonomous planner and task queue | 26 | 352 | Queue triggers, claim ownership, retries, source scope, temporary tasks, staged execution, tool-error feedback and manual API-key dispatch. |
| Assistant conversation and member tools | 21 | 303 | Planning and replies, streaming, attachments, conversation context, attendance, memory, bug reports and optional CRM tools. |
| Map, events, people and assets | 23 | 244 | Normalized events and participants, identity/source checks, current/future presence, fixed buildings, portraits, geometry and historical map schemas. |
| Shared runtime, providers and diagnostics | 22 | 249 | Model-provider protocols/retries, private audit logs, safe diagnostics, source deadlines, login/security, builds and deployment packaging. |
| Calendar, Gmail and Drive | 18 | 283 | Exact calendar targets, dates/time zones, pagination, duplicate prevention, conditional writes, human-edit preservation, truthful saved results and authorized Gmail/Drive reads. |
| Discord bot and source access | 44 | 914 | Channel discovery/blacklists, live retrieval, permissions, threads, replies/images, bridge transport, concurrency, drafts, collector behavior and historical archive checks. |
| Miro tools and migration history | 10 | 94 | Read-only MCP schemas, authorization/OAuth, token sharing, quota, navigation and historical REST snapshot migration checks. |
| Database cleanup history | 4 | 20 | Old schema removal/renaming and preservation of unrelated data and database access restrictions. |
| **Total** | **168** | **2,459** | |

## What is legacy, and what should stay

Here, legacy means a deliberately frozen retired implementation or old migration stage, rather than merely an old filename. Current request-memory Discord summaries, live Miro MCP access, the non-native provider planning path and stored-task compatibility guards remain useful.

| Historical Node file under `tests/` | Individual historical cases |
| --- | ---: |
| [discord-sql.test.mjs](../tests/discord-sql.test.mjs) | 8 |
| [discord-memory.test.mjs](../tests/discord-memory.test.mjs) | 17 |
| [discord-summary-sql.test.mjs](../tests/discord-summary-sql.test.mjs) | 23 |
| [discord-sliced-planning.test.mjs](../tests/discord-sliced-planning.test.mjs) | 14 |
| [discord-summary-execution-budget.test.mjs](../tests/discord-summary-execution-budget.test.mjs) | 4 |
| [discord-live-summary-sql.test.mjs](../tests/discord-live-summary-sql.test.mjs) | 15 |
| [miro-sql.test.mjs](../tests/miro-sql.test.mjs) | 7 |
| [schema-cleanup-sql.test.mjs](../tests/schema-cleanup-sql.test.mjs) | 9 |
| [schema-cleanup-policy-rename.test.mjs](../tests/schema-cleanup-policy-rename.test.mjs) | 5 |
| [schema-cleanup-shared-access.test.mjs](../tests/schema-cleanup-shared-access.test.mjs) | 5 |
| [map-schema.test.mjs](../tests/map-schema.test.mjs) | 11 |
| [map-building-write-scope.test.mjs](../tests/map-building-write-scope.test.mjs) | 10 |
| [map-presence-labels-sql.test.mjs](../tests/map-presence-labels-sql.test.mjs) | 9 |
| [map-events-sql.test.mjs](../tests/map-events-sql.test.mjs) | 5 |
| [map-contracts.test.mjs](../tests/map-contracts.test.mjs) | 5 |
| **Total** | **147** |

These checks cover retired Discord archives/vectors/stored summaries, retired Miro REST snapshots, pre-normalized JSON map storage and the migrations that replaced those designs. Current runtime does not import frozen fixture modules. Migrations 017, 027 and 030 removed the corresponding persistent Discord, JSON map-presence and Miro snapshot storage.

Project instructions explicitly preserve applied migrations and historical SQL verification fixtures. **Keep 139 historical individual cases after the eight helper-only removals below.** Also retain the fixture modules those SQL checks still import; for example, `legacy-memory.mjs` remains part of historical SQL result comparisons. The 13 individual cases in `agent-automation-sql.test.mjs` are not included in the retired-feature total of 147: they exercise a historical automation stage and current configuration behavior within a feature that remains active. Expanding “legacy” to every test that applies an earlier migration would label many current integration tests incorrectly.

## The 13 safe removal candidates

Remove test blocks only, preserving useful neighboring cases and SQL fixtures.

| File | Cases to remove | Reason |
| --- | ---: | --- |
| [discord-memory.test.mjs](../tests/discord-memory.test.mjs) | 3 | The first three standalone cases test only retired seven-day/DST/week grouping helpers. |
| [discord-summary-execution-budget.test.mjs](../tests/discord-summary-execution-budget.test.mjs) | 3 | The first three cases test only the frozen retired summary adapter's deadlines, cancellation and safe failure mapping. Keep its SQL timeout migration case. |
| [discord-summary-sql.test.mjs](../tests/discord-summary-sql.test.mjs) | 2 | Helper-only cases titled “010 store preserves planning budgets and gives locked execution60 seconds, metadata12 seconds” and “009 store pre-abort, in-flight parent cancellation and deadline expiry need no wall-clock wait”. Keep actual SQL cases. |
| [update-agent-miro-outage.test.mjs](../tests/update-agent-miro-outage.test.mjs) | 5 of 6 | All six variants require Miro dependencies never to be called. The changed status cannot affect behavior. Keep one full-handler no-Miro/no-forced-scan case. |
| **Total** | **13** | **Eight retired-helper cases plus five duplicates.** |

The active construction trap and Miro write-provenance guards in `update-agent-mcp.test.mjs` test distinct boundaries and should remain.

## Older browser scripts: consolidation required first

| Legacy browser harness under `tests/` | Named checks |
| --- | ---: |
| `map-browser.mjs` (subsequently removed) | 10 |
| `map-refinement.mjs` (subsequently removed) | 6 |
| `map-details.mjs` (subsequently removed) | 6 |
| `map-m4.mjs` (subsequently removed) | 8 |
| `map-m5.mjs` (subsequently removed) | 8 |
| `map-m6.mjs` (subsequently removed) | 11 |
| `map-m7.mjs` (subsequently removed) | 7 |
| **Total** | **56** |

These harnesses depend on old visible toolbar/building-menu controls that current `.map-only` CSS hides, obsolete model counts and, in some cases, ignored before/after evidence. Do not delete all 56 checks as though they have no value. Preserve or move these unique current checks first:

- `map-browser.mjs`: authoritative Arch, Bobst and Paulson world placement.
- `map-m5.mjs`: original Courant/Stern geometry and materials stay unchanged, with source palette preservation.
- `map-m6.mjs`: street/park bounds, finite geometry, fountain clearance and coordinate alignment.
- Actual pointer selection across complete buildings/multiple sides and bounded panning. Current programmatic framing tests do not replace all of this.

`details-geometry.mjs` is also mixed: it tests a retired detailed Silver Towers model alongside useful Leslie/source-preservation checks. `map-boundary-zoom.mjs` and `map-paulson-views.mjs` assert old camera baselines but retain pointer/camera behavior worth moving before removal. Four old capture-only tools (`gould-front-view.mjs`, `palette-capture.mjs`, `palette-check.mjs`, `map-performance.mjs`) can be removed without deleting a test case; they contain no assertions. These tooling removals are separate from the 13-case recommendation.

## Failures and limitations

- Two cases in [personal-location-behavior.test.mjs](../tests/personal-location-behavior.test.mjs) fail because they expect removed chat original-source/identity/lexical gates. Keep and update them: their SQL identity, corrections, active/future timing and expiry checks still matter. The file's third default case passes.
- Four of that file's eight optional model scenarios also need revision: three expect worker map-only creation rather than Member Plans Calendar-first behavior; one expects the removed chat identity gate. They are not eight extra default Node cases.
- [camera-focus.mjs](../tests/camera-focus.mjs) fails before its 21 named checks because its config-to-data-URL loader does not resolve the new `./go-greek-popup.js` import. Repair the harness; its navigation checks are useful.
- Standalone browser/model scripts were inventoried and reviewed, not all executed. No live model, Discord, Calendar, Gmail, Drive, Miro or hosted database action was performed by this audit.
- The shared optional model verifier contains 14 scenarios; planner-workload selects 4 of those and planner-recovery selects 5 (4 shared plus 1 additional). These overlap rather than adding independent default Node cases. Live-model opt-in was not used.
- There is no root `npm test` command or checked-in CI configuration. Existing npm test commands select subsets. A complete local Node run is `node --test --test-concurrency=4 tests/*.test.mjs`, without loading private environment files.
- Passing synthetic integration tests establish protocol, SQL and authorization behavior against fixtures; they do not prove arbitrary model interpretation or current live integration health. No line/branch coverage percentage was measured.

## Verification evidence

The independent tester ran the 167-file baseline with a content-free machine reporter and a clean child environment containing only PATH/TMPDIR: **2,485 reported results: 2,482 passed, 2 failed, 1 skipped; 105.313 seconds; exit 1.** The skip is an optional Miro observed-schema check without its external `/tmp` fixture. No cases were excluded.

Four implementation/test files changed during that run. The two affected staged suites were rerun against unchanged hashes: 56/56 reported tests passed. A new `plain-task-cache-read.test.mjs` appeared during inventory: 14/14 reported tests passed, including 1 parent and 13 individual cases, with stable hashes. It was added to the current inventory. The reconciled current total is 2,499 results: 2,496 passed, 2 failed, 1 skipped; 2,459 individual cases plus 40 parents. The baseline is not represented as an atomic frozen-tree run.

Focused independent evaluator run: 101 reported tests, 99 passed, 2 failed, 0 skipped; both failures are the same stale personal-location expectations. Additional inert standalone checks: keyboard-pan 14/14 passed; startup-visual 12/12 passed; camera-focus failed during module loading as described above.

Temporary machine evidence lives under `/tmp/techvisualized-test-audit-count/`:command.json,node-events.jsonl,per-file-counts.json,standalone-check-counts.json and manifests. The CSV preserves per-file counts in the repository. Runtime/test code remains unchanged by this audit.

## Standalone script inventory

“Other form” means inline assertions, custom scenarios, or a capture/inspection tool; it does not mean zero coverage. Fixed `check()` counts are static expanded registrations, not claimed successful executions.

| Script under `tests/` | Fixed named `check()` count | Classification |
| --- | ---: | --- |
| [assistant-dismiss-browser.mjs](../tests/assistant-dismiss-browser.mjs) | Other form | Current or reusable validation/inspection |
| [assistant-scroll-browser.mjs](../tests/assistant-scroll-browser.mjs) | Other form | Current or reusable validation/inspection |
| [brand-loader-browser.mjs](../tests/brand-loader-browser.mjs) | 12 | Current or reusable validation/inspection |
| [broadway-683-browser.mjs](../tests/broadway-683-browser.mjs) | 10 | Current or reusable validation/inspection |
| [building-view-browser.mjs](../tests/building-view-browser.mjs) | 23 | Current or reusable validation/inspection |
| [camera-focus.mjs](../tests/camera-focus.mjs) | 21 | Current or reusable validation/inspection |
| [chat-production-browser.mjs](../tests/chat-production-browser.mjs) | Other form | Current or reusable validation/inspection |
| [chat-tool-browser.mjs](../tests/chat-tool-browser.mjs) | Other form | Current or reusable validation/inspection |
| [chat-uploads-browser.mjs](../tests/chat-uploads-browser.mjs) | Other form | Current or reusable validation/inspection |
| `details-geometry.mjs` (subsequently removed) | Other form | Mixed historical/current geometry |
| [discord-admin-browser.mjs](../tests/discord-admin-browser.mjs) | Other form | Current or reusable validation/inspection |
| [events-browser.mjs](../tests/events-browser.mjs) | 17 | Current or reusable validation/inspection |
| [feedback-browser.mjs](../tests/feedback-browser.mjs) | Other form | Current or reusable validation/inspection |
| [global-center-geometry.mjs](../tests/global-center-geometry.mjs) | 12 | Current or reusable validation/inspection |
| `gould-front-view.mjs` (subsequently removed) | Other form | Capture-only obsolete tool |
| [keyboard-pan-browser.mjs](../tests/keyboard-pan-browser.mjs) | 17 | Current or reusable validation/inspection |
| [keyboard-pan.mjs](../tests/keyboard-pan.mjs) | 14 | Current or reusable validation/inspection |
| [lipton-selection-browser.mjs](../tests/lipton-selection-browser.mjs) | 7 | Current or reusable validation/inspection |
| [map-avatar-drag-browser.mjs](../tests/map-avatar-drag-browser.mjs) | Other form | Current or reusable validation/inspection |
| [map-avatar-storage-browser.mjs](../tests/map-avatar-storage-browser.mjs) | 6 | Current or reusable validation/inspection |
| `map-boundary-zoom.mjs` (subsequently removed) | Other form | Old camera baseline; consolidate behavior |
| `map-browser.mjs` (subsequently removed) | 10 | Legacy browser harness; extract useful checks first |
| [map-building-activity-browser.mjs](../tests/map-building-activity-browser.mjs) | 5 | Current or reusable validation/inspection |
| `map-details.mjs` (subsequently removed) | 6 | Legacy browser harness; extract useful checks first |
| [map-event-indicators-browser.mjs](../tests/map-event-indicators-browser.mjs) | 9 | Current or reusable validation/inspection |
| [map-failures.mjs](../tests/map-failures.mjs) | 3 | Current or reusable validation/inspection |
| [map-focus-framing-browser.mjs](../tests/map-focus-framing-browser.mjs) | Other form | Current or reusable validation/inspection |
| [map-input-browser.mjs](../tests/map-input-browser.mjs) | 14 | Current or reusable validation/inspection |
| [map-interactions.mjs](../tests/map-interactions.mjs) | 16 | Current or reusable validation/inspection |
| `map-m4.mjs` (subsequently removed) | 8 | Legacy browser harness; extract useful checks first |
| `map-m5.mjs` (subsequently removed) | 8 | Legacy browser harness; extract useful checks first |
| `map-m6.mjs` (subsequently removed) | 11 | Legacy browser harness; extract useful checks first |
| `map-m7.mjs` (subsequently removed) | 7 | Legacy browser harness; extract useful checks first |
| [map-memory.mjs](../tests/map-memory.mjs) | 5 | Current or reusable validation/inspection |
| `map-paulson-views.mjs` (subsequently removed) | Other form | Old camera baseline; consolidate behavior |
| `map-performance.mjs` (subsequently removed) | Other form | Capture-only obsolete tool |
| [map-presence-browser.mjs](../tests/map-presence-browser.mjs) | 16 | Current or reusable validation/inspection |
| [map-presentation.mjs](../tests/map-presentation.mjs) | 16 | Current or reusable validation/inspection |
| `map-refinement.mjs` (subsequently removed) | 6 | Legacy browser harness; extract useful checks first |
| [map-refresh-browser.mjs](../tests/map-refresh-browser.mjs) | 10 | Current or reusable validation/inspection |
| [map-startup.mjs](../tests/map-startup.mjs) | 9 | Current or reusable validation/inspection |
| [optimization-browser.mjs](../tests/optimization-browser.mjs) | Other form | Current or reusable validation/inspection |
| `palette-capture.mjs` (subsequently removed) | Other form | Capture-only obsolete tool |
| `palette-check.mjs` (subsequently removed) | Other form | Capture-only obsolete tool |
| [park-vegetation.mjs](../tests/park-vegetation.mjs) | 8 | Current or reusable validation/inspection |
| `planner-recovery-model.mjs` (subsequently removed) | Other form | Optional model harness |
| `planner-workload-model.mjs` (subsequently removed) | Other form | Optional model harness |
| [rapid-ui-browser.mjs](../tests/rapid-ui-browser.mjs) | Other form | Current or reusable validation/inspection |
| `source-geometry.mjs` (subsequently removed) | Other form | Current or reusable validation/inspection |
| [spotlight-browser.mjs](../tests/spotlight-browser.mjs) | 13 | Current or reusable validation/inspection |
| [startup-reveal-browser.mjs](../tests/startup-reveal-browser.mjs) | Other form | Current or reusable validation/inspection |
| [startup-visual.mjs](../tests/startup-visual.mjs) | 12 | Current or reusable validation/inspection |
| [union-square-context.mjs](../tests/union-square-context.mjs) | 16 | Current or reusable validation/inspection |
| [user-time-zone-browser.mjs](../tests/user-time-zone-browser.mjs) | Other form | Current or reusable validation/inspection |
