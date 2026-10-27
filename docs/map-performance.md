# Map resource and frame performance

`src/map/landmarks/map-resources.js` contains narrowly scoped load-time resource helpers. They
preserve every rendered position, normal, index, transform, draw range and group;
there is no geometry simplification, new quantization or pixel-ratio change.

## Context geometry packing

`compactContextGeometry(root, contextMaterial)` accepts the exact known pale,
untextured `MeshStandardMaterial` used by the city context. It ignores meshes
using other material objects and rejects textured or vertex-colored materials.
Morph targets, skinned/instanced geometry and unknown custom attributes are also
excluded. The loader should call it after extracting/removing replaced buildings
and assigning the final context material, but before adding the model to the scene
or creating GPU buffers. Lipton and the two restored Union Square assets are also
eligible after their intentional context-material assignment.

Source city tiles use normalized Int16 position and normal vectors in four-element
strides, despite each vector having only three components. Their unused colors
have separate buffers. The helper copies the three **raw** components into packed
arrays of the same type and preserves the normalization flag, usage and GPU type.
It never converts through decoded floating-point values. Retained index arrays
are copied unchanged into exact-size storage. Colors and unused UV attributes are
omitted only for the explicit untextured context material.

New geometries own their buffers. Shared originals are not modified or disposed;
Three's `WebGLGeometries` disposal removes GPU attributes without reference
counting other geometries that might share them. Pre-upload replacement avoids
that hazard. Unreferenced original CPU buffers can then be collected normally;
other surviving references may prevent collection. Reapplying the helper to its
own results is a no-op. This does not support compacting arbitrary already-rendered
objects: doing that could leave GPU allocations alive or disturb shared buffers.

The returned report has `meshes`, `geometries`, `beforeBytes`, `afterBytes`,
`savedBytes` and `skipped`. `geometryBufferBytes(geometries)` counts distinct CPU
ArrayBuffer backing bytes, not JavaScript heap overhead, peak memory or measured
GPU VRAM. The helper's report covers candidate geometry only; full-scene accounting
must deduplicate across the entire scene.

## Static transforms

`freezeStaticSubtree(root, {keepRootDynamic:true})` composes each static descendant's
local matrix once and disables its `matrixAutoUpdate`. World-matrix propagation
remains enabled, so moving or lifting the landmark root still moves its children.
Already-authored manual matrices are preserved. Decorations, explicitly dynamic
objects, bones, skinned meshes and branches with animation clips are skipped.
For entirely static environment roots, pass `keepRootDynamic:false` after final
placement. It does not freeze `matrixWorldAutoUpdate`; complete world-matrix
freezing requires a separate proof that no ancestor or object will move.

## Evidence and tradeoffs

The independent pre-change profiler reported 124 jobs, 110 city tiles and 11
landmarks, with 69,737,778 distinct geometry-buffer bytes, 668 meshes, 443 geometries
and 187 materials. Existing eager hover overlays accounted for 12,224,628 bytes.
These are offline scene measurements, not browser FPS or GPU-memory measurements.
The separate effect-controller pass owns overlay and per-frame traversal changes;
the orchestrator owns material sharing and raycast scheduling.

A representative original `tile-2_-4.glb` contains three meshes. The coder's Node
check measured 128,232 backing-buffer bytes before compaction and 84,696 afterward,
a reduction of 43,536 bytes (about 34%). It asserted every raw position/normal/index
component, typed-array class and normalized flag was unchanged. Original buffers
and color attributes remained intact on the old geometry, repeated compaction did
nothing, and a two-meter parent lift propagated exactly after descendant freezing.

Packing allocates and copies retained data once during load, temporarily retaining
old and new arrays together. Its final memory saving must not be described as a
peak-loading-memory saving. Loading concurrency is unchanged: reducing it without
peak-memory measurements would trade away loading speed without established need.
Source GLB files remain immutable. Independent tests should verify full-scene
savings and shader/interaction invariants before integration acceptance; browser
appearance and live frame timing remain unmeasured in this pass.

## Integrated result

The complete offline scene retained 52,479,390 geometry-buffer bytes versus 69,737,778 before (24.75% reduction). See [independent report](../evidence/m12-memory/tester-report.md). This is not total browser or GPU memory. Original source asset hashes and architecture triangle count remain unchanged.

Picking caches mesh candidates including all context occluders, computes local bounding boxes once, and reuses the intersections array. Pointer hover work is coalesced at 80ms; outward wheel events no longer synchronously raycast. Click and eligible inward focus remain immediate, all ordinary zoom deltas are preserved. Synthetic bursts verify 200 pointer moves become one deferred pick and 100 outward events perform zero synchronous picks while delivering all deltas.

See [research and runtime profiling](map-performance-research.md) for source provenance and remaining live verification.
