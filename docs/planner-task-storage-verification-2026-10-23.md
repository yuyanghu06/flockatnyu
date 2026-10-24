# Planner saved-task storage verification — October 23, 2026

The saved-task loading fix is deployed and independently accepted. The worker now reads a small task catalogue and fetches complete records for relevant tasks. One ordinary cycle completed after release. Two others failed during checkpoint saving at the existing task-size limit, so planner completion still needs further work.

## What changed

The worker previously loaded every complete saved task at startup, phase transitions and completion. Migration 045 adds separate service-only catalogue and exact-task read functions. All five complete-backlog loads now use these functions. They read saved data only and do not fetch Discord, Gmail, Calendar, map or other source content.

Catalogue metadata grants no read receipt or write authority. Current-input coverage compares complete originals. Selected task reads retain compact/full views, fragment delivery and exact-version proof. Completion compares complete relevant snapshots and timestamps. Stable generated IDs are read before merging. Mechanical, old and untouched tasks remain saved.

Both functions retain source scope, expiry and runner-lease checks. They do not prune data or hold a runner write lock while serializing histories. Existing mutation functions, RLS and authorization checks remain. Runtime changes are limited to `server/automation/task-store.js`, `staged-pipeline.js` and `handler.js`.

Storage diagnostics record fixed operation/error categories, HTTP status, elapsed time and response bytes. They exclude raw bodies, source contents, exceptions and credentials. Model prompts, exposed tools, provider, timeouts, 16 calls per reply, 64 calls per stage and 10 follow-up turns are unchanged. Initial successful finish still triggers its separately named Calendar-to-map sync.

## Why the nine historical attempts failed

Nine were incomplete automatic batch attempts, not nine complete planner passes. Two stopped before inference and seven while checking initial finish. Local model tests and manual starts contributed zero runs. Seven inspected traces read normal club channels; originals for the two pre-model attempts were not classified.

Both failing paths loaded the complete saved backlog. Read-only full aggregation of 131 tasks, about 12.4 MB, took 16,502 ms against an eight-second database role limit and a 15-second request deadline. This establishes the expensive query shape and makes timeout the leading explanation. Historical diagnostics did not retain the exact error subtype for all nine requests.

## Verification

Actual local PostgreSQL through PGlite and scripted production-runner checks pass. A synthetic 131-task dataset is 12,504,265 bytes; its catalogue is 68,153 bytes and an exact complete read 99,901 bytes. The runner scenario uses a 12,497,894-byte backlog, transfers at most 95,528 bytes per storage response, reads only its selected task and preserves 130 old tasks unchanged. These checks exercise storage mechanics with simulated sources; they do not establish real-model understanding or live business changes.

Current and isolated frozen-source gates each pass 306 checks with no failures or skips. They cover SQL service guards, large backlogs, current originals, same-version content changes, versions, expiry, source revocation, lost lease, fragments, confirmed exact resolution, mechanical collisions and preservation. The unchanged 15-second deadline is exercised. API build and whitespace checks pass. Independent evaluator accepts the release.

Four older suites retain 24 failures. An isolated baseline replacing the three runtime files with prechange commit `5283209` has 25 failures; every currently failing test name also fails there. This is not a whole-repository passing claim.

A read-only hosted metadata projection of 137 unexpired tasks took 722.196 ms and returned 88,583 bytes. It omitted the private scope-helper predicate because the developer read-only connection cannot execute it. This is a query-shape benchmark, not an exact RPC or identical-snapshot comparison.

## Hosted migration and release

Reviewed local migration 045 was applied as hosted `20261023234558_agent_task_catalogue` through the existing signed-in correct-project SQL editor. The 6,020-byte stored source exactly matches local SQL. Source MD5 is `b4ea77c7fc50b37046015432c7210e28`; catalogue and exact-read body MD5 values are `f392fbba078995ff3b4c06c44979bcd9` and `e6ecaf4ebf4b4881ac091dd282b4eb29`. Both functions use SECURITY DEFINER, an empty search path and service-only execution. PUBLIC, anon and authenticated cannot execute them. The normal developer connector remains read-only.

A migration-wrapper receipt escaping error was caught before execution. Corrected wrapper SHA-256 `e71321af902ed3f46b810943ef6944e3758e1add1214256f78407b49a6b37ed6` passes exact source comparison and independent local SQL execution. Editor contents were checked before Run; no erroneous wrapper was applied. REST empty-scope probes returned HTTP 200 with ready/zero tasks and not_found. Explicit PostgREST schema refresh is included.

Railway worker `a34ade2f-42aa-4c1d-a190-8cc51447d45b` is SUCCESS/online, activated at 7:52:01 PM New York. Its 60-file package contains released `d56cea87` baseline plus the three reviewed runtime files. All packaged hashes match. Unrelated web changes, credentials and evidence were excluded. Website, collectors and environment variables were not changed. Source commit `23c0e69` and documentation commit `11ecbca` were pushed to `origin/codex/dev`.

## Ordinary live runs through 7:58:22 PM New York

This cohort includes only runs that started after activation, excluding a predecessor run that finished during handoff. These were ordinary queued work; no manual starts, test messages or business-write smoke tests were issued.

| Run | Outcome | Initial inputs handled | Evidence |
| --- | --- | --- | --- |
| `ed32f908` | Final checkpoint save rejected | 0 of 2 | Initial finish succeeded; catalogue and exact reads ready; save returned HTTP 200 / invalid_request |
| `42197dba` | Completed, including follow-up | 1 of 1 | 18 tool calls, 13 total rounds; checkpoint saves ready |
| `14d059ac` | Final checkpoint save rejected | 0 of 2 | Catalogue and exact reads ready; save returned HTTP 200 / invalid_request |

Populated catalogue responses were approximately 87–88 KB and took 0.8–1.5 seconds. Observed exact complete reads took approximately 0.2–0.7 seconds. The successful run confirms one complete ordinary cycle and queued-input completion. It does not establish saved-task resolution, backlog clearance or actual Calendar/map changes.

## Remaining checkpoint limitation

The new diagnostics identify `save`, rather than a slow list/read, as the remaining failure. Node validates task JSON using compact `JSON.stringify`; unchanged SQL migration 039 measures PostgreSQL JSONB text against 262,144 bytes. With the validated UUID/scope/source inputs and no explicit expiry in checkpoint saving, this database size check is the sole remaining explicit invalid_request branch. Exact attempted database bytes were not captured; do not attribute the representation difference solely to whitespace or claim a measured history size.

No history was truncated, no task-size bound was increased and failed saves leave existing tasks unchanged. The next work is to design and verify retention of new execution history when a task reaches its existing size limit, while preserving originals, prior context and exact source/version checks. This release fixes loading; it does not claim complete planner reliability.

Detailed local test, package, query, receipt and live observation evidence is ignored under `evidence/planner-task-storage/`. The final observation is `final-live-storage-observation.json`; `live-storage-observation.json` is the earlier partial observation. The migration screenshot is `migration-success.jpg`.
