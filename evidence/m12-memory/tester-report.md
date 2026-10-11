# M12 independent resource and hover verification

Commands executed from repository root:

- Before changes: `node --expose-gc tools/profile-map-memory.mjs baseline` — complete 124/124 jobs, 110 tiles, 11 landmarks, no failures. Historical baseline is protected from overwrite.
- After integration: `node --expose-gc tools/profile-map-memory.mjs optimized` — same complete coverage and unchanged source GLB SHA-256 hashes.
- `node tests/map-memory.mjs` — **5/5 pass**.
- `node tests/map-presentation.mjs` — **16/16 pass** after updating expected hover semantics and normalizing source-file line endings in a static assertion.

| Scene-owned resource | Before | After |
|---|---:|---:|
| Distinct retained geometry buffer bytes | 69,737,778 | 52,479,390 |
| Idle meshes | 668 | 657 |
| Distinct geometries | 443 | 432 |
| Scene-referenced materials | 187 | 170 |
| Idle duplicate overlay bytes | 12,224,628 | 0 |

The geometry buffer reduction is **17,258,388 bytes (24.75%)**: 12,224,628 bytes of eager overlay copies removed and 5,033,760 bytes saved by context attribute compaction. All eleven live hover cases add **zero distinct geometry buffer bytes** and one shared effect material relative to idle. The effect controller retains that single material even when no scene object references it; the table counts materials reachable from scene meshes.

The tradeoff is more active overlay meshes: one per source mesh, ranging from 1 (arch/Lipton) to 11 (Gould), compared with the previous single merged overlay. These are potential additional draws while hovering, not measured GPU draw calls. No overlay is retained in the scene at idle. Architecture triangle count remains 966,443; baseline's higher scene total included the eager duplicate overlays.

Independent checks preserve raw interleaved/normalized position and normal components, indices, groups and draw ranges; verify shared source geometries are neither changed nor disposed; skip textured, vertex-colored, instanced and custom-attribute cases; preserve descendant transforms under root lift; and share instance matrices in lazy overlays without disposal. Selected and unselected hovered roots both float 4.5 m; leave removes the overlay immediately and returns the root smoothly. Bobst's configured glow is distinct from the general style. Complete-root transform alignment, raycast exclusion, material preservation and reduced motion pass.

The profiler matches main's placement/replacement pipeline, compaction before registration/rendering, material sharing, frozen descendants, pick-mesh bounding boxes and lazy effects. It assembles one scene; it does not make duplicate models for measurement. Geometry counts deduplicate actual ArrayBuffer identities. Attribute-upload bytes remain an estimate, not measured GPU allocations.

Node's final post-GC process sample was heapUsed 16,554,416 bytes and arrayBuffers 87,972,758 bytes, versus 16,708,128 and 100,348,406 in baseline. Process samples include decoder/transient/profiler overhead and differ from scene-retained geometry; **they are not browser heap or GPU measurements**. No browser, server, network or Git operation was performed. Visual glow differences, physical interaction and live FPS remain unverified.

Changed files are the owned profiler, memory/presentation tests and M12 evidence. Parent owns shared documentation and acceptance journal. `baseline.json` and `optimized.json` preserve detailed per-landmark counts and source hashes.
