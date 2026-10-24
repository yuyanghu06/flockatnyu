# Planner saved-task loading

Goal: remove complete-backlog history transfers from startup, phase transitions and completion while preserving existing authorization, complete original data and exact-version checks.

Implemented and deployed: service-only migration 045 adds a small metadata catalogue and exact complete-task reads. All five former full-list sites use them. Safe diagnostics identify operation, error category, HTTP status, time and response size without source bodies or credentials. Prompts, limits, timeouts and separate post-finish Calendar synchronization are unchanged.

Accepted evidence: independent current and frozen-source gates each pass 306 checks; actual local PostgreSQL and scripted production-runner scenarios preserve old/mechanical/untouched tasks and verify source/lease/version/fragment boundaries. Hosted migration receipt, bodies, service-only grants and REST endpoints match. Four older suites have baseline-confirmed unrelated failures.

Release: hosted migration `20261023234558`; Railway worker `a34ade2f-42aa-4c1d-a190-8cc51447d45b` online at 7:52:01 PM New York, October 23. Source `23c0e69` and initial evidence `11ecbca` pushed. Only the isolated reviewed worker package was deployed.

Live observation through 7:58:22 PM: catalogue 0.8–1.5 seconds, exact reads approximately 0.2–0.7 seconds. One ordinary run completed with one input handled. Two failed at checkpoint save under the existing 256 KiB JSONB size check; the read bottleneck did not recur. Saved-task resolution and actual Calendar/map changes are not established.

Status: bounded catalogue/read milestone complete and independently accepted. Overall planner completion remains imperfect because growing checkpoint history can exceed the unchanged per-task limit. No truncation or limit increase was performed. The next work is retention of new history at that limit while preserving originals and prior context.

[Verification and limitations](../../docs/planner-task-storage-verification-2026-10-23.md) · [Current project snapshot](../milestone.md)

October24 overnight status: the loading release remains unchanged and online. Of541 batch attempts through7:36AMNY,28 were marked completed with36 queued inputs acknowledged; one exact task resolution is recorded. From11:21PM, model requests consistently returned429, producing461 unavailable batches. Earlier47 preflight failures and5 round-limit outcomes also occurred. Recent catalogue reads succeed; no all-night latency or broad reliability claim. See the current snapshot and overnight history for exact evidence and caveats.
