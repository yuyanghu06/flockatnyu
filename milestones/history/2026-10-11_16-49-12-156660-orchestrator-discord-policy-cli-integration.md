# Discord policy CLI integration

- Timestamp / role / milestone: 2026-10-11T16:49:12.156660-04:00 / orchestrator / M18.
- Scope: Requested discovery/blacklist/time-tier/no-images/no-embeddings rebuild.
- Starting state: Railway paused, M17 originals retained, specialists implementing storage/discovery.
- Changed files: CLI management commands and automatic discovery/classification hooks, sync policy revision and image stripping, retrieval embedding execution blocked, package/env scripts and affected guides.
- Decisions: Explicit discovery permitted while paused; history blocked until policy active and discovery complete. Exact168hour recent cutoff with NYcalendar grouping.
- Checks: API syntax/runtime build passed; 23/23 existing launch tests passed. Live guild metadata confirms four category IDs/type4 and excluded channel/type0, 114total metadata entries,30direct/descendant exclusions; no history read during metadata check.
- State: Integration staged; new SQL and independent boundary tests still pending. No reset/deploy performed.
- Handoff: Resolve independent findings, review/apply migration, configure paused policy, reset and rebuild eligible originals, verify hosted buckets and worker.
