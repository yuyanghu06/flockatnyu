# M12 offline memory baseline

Command: `node --expose-gc tools/profile-map-memory.mjs baseline` (Node v24.11.1), exit 0. Captured before M12 implementation changes.

Coverage is complete for the current load list: 124/124 jobs, 110 tiles, 11 registered landmarks, no failures. This includes both street/park and vegetation GLBs, procedural replacements, source placement transforms, Courant/Stern details, eager landmark overlays, per-mesh registration material clones, ground and analytic sky. Source GLB SHA-256 hashes were checked before/after the read-only assembly.

| Metric | Baseline |
|---|---:|
| Distinct retained geometry ArrayBuffer bytes | 69,737,778 |
| Attribute references, including sharing | 89,001,954 |
| Meshes / distinct geometries / materials | 668 / 443 / 187 |
| Eager overlay geometry bytes | 12,224,628 |
| Eager overlay triangles | 339,573 |
| Node heapUsed after requested GC | 16,708,128 |
| Node process arrayBuffers | 100,348,406 |

`baseline.json` contains coverage, scene/overlay/per-landmark counts, source hashes and process sample. Counts deduplicate underlying ArrayBuffers by object identity; referenced attributes can share storage and are not summed as actual retained memory. Distinct typed-array bytes approximate uploaded attribute/index storage, not measured GPU allocations. CPU geometry storage and Node process memory are different scopes: the latter also includes decoder and transient/profiler allocations. No browser heap, browser performance or GPU memory was measured. No extra scene copies were created merely for profiling.
