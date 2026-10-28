# Release review finds worker image dependency omissions

- Local timestamp / acting role / milestone: 2026-10-27T19:35:44.314791-04:00 / evaluator / full-tree-release-2026-10-27.
- Requested scope: commit/push/deploy the entire tree onto Railway, leaving the update agent paused and not running another production cycle.
- Starting repository state: dev/tool-api-services with accepted prompt/API/cache/location code; isolated snapshot and explicit private-variable/queue boundaries.
- Work performed / changed files: Container review found that the worker Dockerfile omitted src/api even though the new private operation app imports its register/routes. Subsequent actual COPY projection also found stale COPY tools: the worker's direct-server reachable graph contains no tools directory. Passing syntax checks and package membership alone had not tested the resulting image filesystem.
- Decisions: Test actual image contents/imports, not package membership or syntax alone. Keep fixed graph/source/secret boundaries. Preserve original region, private variables except the deliberate activation=false, volumes, source grants and all queue/task data. No SQL or dependency upgrade.
- Checks and evidence: ignored evidence/full-tree-release-2026-10-27 contains final container CI, image projection/negative controls, source pins, worker pause/region readbacks and previous deployment metadata. [Release scope](../full-tree-release-2026-10-27/info.md).
- Resulting state / acceptance: REQUEST CHANGES held the worker upload. No new application package had been uploaded. The source/runtime feature review remained accepted; package construction required correction.
- Remaining work and handoff: Record exact clean commit and five reviewed package hashes, push current development branch, upload/verify all services, then journal hosted and Git parity. No planner start or business-write smoke test.
