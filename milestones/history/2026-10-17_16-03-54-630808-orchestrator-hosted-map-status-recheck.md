# Recheck hosted map schema and rows

- Local timestamp / acting role / milestone: 2026-10-17T16:03:54.630808-04:00; orchestrator; map roster.
- Requested scope: confirm migration application and table population.
- Starting repository state: map schema and roster previously applied; unrelated edits preserved.
- Work performed / changed files: read-only live queries of the exact configured project; journal updates only.
- Decisions: report hosted application separately from Git publication.
- Checks and evidence: migration receipt20261017194715 named map_people_buildings exists; map_people contains26rows with26Discord links; map_buildings contains9rows with empty presence arrays.
- Resulting state / acceptance: hosted migration and populated tables verified; no cloud writes or tests needed for this status query.
- Remaining work and handoff: frontend/agent map wiring remains separate; no commit or Git push performed.
