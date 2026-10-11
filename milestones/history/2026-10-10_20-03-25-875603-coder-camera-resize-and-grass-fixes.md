# camera-resize-and-grass-fixes

- Local timestamp / acting role / milestone: 2026-10-10T20:03:25.8756038-04:00 / coder / M1.
- Requested scope: Resolve evaluator findings and distant grass artifact.
- Starting repository state: Implemented first map, two P2 findings and distant green slivers in screenshot.
- Work performed / changed files: map_coder changed src/main.js and src/geometry.js: moved resize listener before loading; added 1e-8 numerical boundary tolerance; filtered merged park-grass triangles in world space rather than whole-mesh center.
- Decisions: Grass GLB spans distant parks in one merged mesh, so triangle filtering is needed for bounded scenery.
- Checks and evidence: Coder reports syntax checks pass and evaluator boundary camera sample validates. Grass source spans x -1814..2116, z -1592..2540.
- Resulting state / acceptance: Fixes implemented; independent retests pending.
- Remaining work and handoff: Rebuild production preview, rerun targeted tests, review updated evidence.
