# M22 Discord pre-commit tester report

## Final independent rerun — PASS

- **Milestone / role / scope:** M22 independent tester; complete offline Discord suite after the bounded fixture corrections. Owns only this report; root owns implementation, journals, staging and publication. No live/cloud/model calls, credentials, schema/deployment changes, child agents or manual edits outside this report.
- **Starting state / files inspected:** original failing run below; current two corrected SQL fixture files; parent handoff freezing their implementation; repository instructions, milestone/to-do, workflow and report template. Original migration006 now applies before historical scale seeding, bulk fixtures receive trusted source names, and the original name assertions remain. Fixture-generated catalogue/plans/slices now use unique OS temporary directories.
- **Work performed / changed files:** repeated the entire assigned15-file command with credentials stripped from the inherited environment, captured a temporary log and result metadata, compared SHA256 hashes of legacy evidence before/after, and updated this report. No tests or implementation files edited by this tester.
- **Decisions / assumptions:** retain the original failure as history, require full-suite success after the fixture correction, and verify historical evidence protection rather than infer it from temporary output paths.

### Executed checks

```sh
node --test --test-concurrency=2 tests/discord*.test.mjs
```

The Python launcher expanded the wildcard to all15 matching test files, removed inherited variables prefixed DISCORD_, SUPABASE_, OPENAI_, LLM_ or ANTHROPIC_, and captured stdout/stderr in `/tmp/discord-precommit-rerun-20261013.log`. Exact command, file list, timestamps, duration, exit and hash-comparison result are recorded in `/tmp/discord-precommit-rerun-20261013-result.json`. Runtime: Node v25.8.0.

| Result | Actual observation |
|---|---|
| Start / end UTC |2026-10-13T16:15:45.660400Z /2026-10-13T16:16:40.514300Z|
| Process exit |0|
| Node test cases |270passed /270total;0failed/cancelled/skipped/todo|
| Wall duration |54.853760582976975seconds|
| Node duration |54786.566583milliseconds|
| Legacy evidence files hashed |253|
| Legacy changed/new/deleted paths |0|
| Before/after SHA256 dictionaries |Identical|

```text
ℹ tests 270
ℹ suites 0
ℹ pass 270
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 54786.566583
```

The reported270 are Node test cases including subtests, not a count of individual assertion calls.

Legacy hash check used sorted recursive file enumeration and `hashlib.sha256(path.read_bytes()).hexdigest()` before/after across `evidence/m16-discord-archive/`, `m17-discord-launch/`, `m18-discord-memory/`, `m19-building-views/`, `m20-discord-summaries/`, `m20-loading-gears/`, `m21-map-input/`, plus `evidence/execution-budget-catalogue.json`. Complete maps remain in `/tmp/discord-precommit-rerun-20261013-before.json` and `/tmp/discord-precommit-rerun-20261013-after.json`; all253 entries matched.

The complete suite exercised client/API/store/provider mocks, discovery/exclusion boundaries, launch/backfill/cancellation, sync/image stripping, genuine local SQL migrations and permissions, memory grouping, durable sliced planning/recovery, citation/phase/truncation/budget guards, calendar scheduling, lineage and atomic compaction. The representative108836-original/216-source/104MB fixture reached its full695-unit planning and6397-original publication acceptance rather than stopping at the historical name assertion.

### Findings / limits / handoff

**PASS — complete offline Discord pre-commit scope.** No remaining failure in the270 executed cases; zero historical evidence changes during the final rerun. The initial269/270failure and its harness-side-effect caveat remain below and are superseded for current acceptance by this passing rerun.

Clients/providers/stores use injected mock fetch responses; SQL fixtures use local PGlite, and CLI children use fixture/missing configuration. No Supabase MCP/runtime, Discord, model, deployment or credential action was made by this tester. This is offline fixture acceptance, not a renewed claim about live data, cron or deployments. Frontend/assistant checks, builds, Git splitting/commit/push and publication review are separately root-owned; this pass did not rerun them.

- **Folder-guide updates needed:** root owns the evidence guide and journal.
- **Handoff / recommended next action:** root may journal this PASS and integrate it with the parallel frontend/assistant/build and evaluator checks before the authorized Git publication.

## Initial run — failure preserved as history

- **Milestone / role / scope:** M22 independent tester; complete offline Discord fixture suite on the combined dirty working tree. Owns only this report. No implementation/test edits, Git staging/commit/push, live calls, models, credentials, schema/deployment changes or child agents.
- **Starting state / files inspected:** AGENTS.md, milestone/to-do, latest M20 acceptance history, workflow, tester role and report template; dirty Git state; Discord fixture fetch injection, PGlite harnesses, sanitized CLI subprocesses and the failing scale setup.
- **Work performed / changed files:** executed the assigned complete suite once, inspected the failure, wrote this report. Test harness itself regenerated `evidence/execution-budget-catalogue.json`; its prior bytes were not captured, so byte identity cannot be claimed. No manual edits to that catalogue or other agents' files occurred. The failed scale case stopped before its existing evidence-plan/slices writes. Root was notified of these fixture output paths.
- **Decisions / assumptions:** preserve applied migrations001–010; distinguish a historical fixture's unfrozen clock from runtime behavior. Test launcher removed inherited DISCORD_, SUPABASE_, OPENAI_, LLM_ and ANTHROPIC_ variables without exposing values; fixture adapters use explicit mocked fetch and SQL uses local PGlite. No `.env` or credentials were read by this tester. No successful hosted/model/Discord action belongs to this pass.

## Executed check

```sh
node --test --test-concurrency=2 tests/discord*.test.mjs
```

Python expanded the wildcard to15files, sanitized the inherited environment, captured stdout/stderr in `/tmp/discord-precommit-20261013.log`, and recorded timestamps/exit in `/tmp/discord-precommit-20261013-result.json`. Runtime: Node v25.8.0.

- Start UTC:2026-10-13T16:08:32.425786Z.
- End UTC:2026-10-13T16:09:03.769134Z.
- Wall duration:31.337623333965894seconds.
- Node reported duration:31267.254208milliseconds.
- Exit1;270test cases;269passed;1failed;0cancelled/skipped/todo.
- These are Node test-case totals, including subtests; the runner does not count individual assertion calls.

```text
ℹ tests 270
ℹ suites 0
ℹ pass 269
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 31267.254208
```

## Reproducible failure

`tests/discord-summary-sql.test.mjs:456:1`, test `representative108836 originals/216sources/779 raw groups plan and6397-original publication fit scoped RPC budgets`.

Assertion at line484:

```text
expected { raw:1769, wrong_name:0 }
actual   { raw:1769, wrong_name:1769 }
```

The fixture uses fixed asOf2026-10-11 and October9 raw rows, then applies006 verbatim. Migration006 populates names only from the actual current America/New_York week using `now()`. On October13 that startsOctober12; the historical October9 fixture rows therefore remain unnamed. This demonstrates a clock-dependent fixture setup failure; this run does not establish a production migration defect. No immutable migration was changed.

## Findings, verdict and remaining work

**FAIL / pre-commit Discord acceptance pending.** Root received the exact case/location/counts promptly. Fix the fixture's controlled time/setup while preserving the useful trusted-name assertion and immutable SQL. Redirect catalogue/scale evidence generation to `/tmp` before rerun so verification does not overwrite prior evidence.

The largest6397-original publication and complete695-unit scale planning were not reached in this run. The other269cases passed; no additional frontend/assistant/build/hosted check was run by this tester. Root owns parallel non-Discord checks and Git publication.

- **Folder-guide updates needed:** root owns evidence guide/journal updates.
- **Handoff:** root fixes fixture isolation, then authorizes/reuses this tester for the complete assigned command. No commitment/publication acceptance from this failing run.
