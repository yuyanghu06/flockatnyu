# Courant and Stern existing-window refinement

The M5 request reauthorized Courant and Stern after the earlier cancellation,
specifically asking for the framed-window treatment used on Leslie and Silver
Center while preserving each building's current colors. This pass adds small
details to the existing baked window geometry. It does not reinterpret their
architecture or replace their models, so no new architectural features or new
reference photographs were invented.

## Source inspection and preserved palette

The readonly sources are:

- `yuyang-site-3d-assets/models/buildings/courant-institute.glb`
- `yuyang-site-3d-assets/models/buildings/stern-school-of-business.glb`

Both contain geometry baked in Washington Square map coordinates, with white
base materials and per-vertex color. GLTF-Transform/GLTFLoader inspection found
370 connected Courant glazing boxes and1,098 Stern glazing components. Their
actual triangle boundaries determine detail placement; there is no guessed
window grid or new glazing plane.

Original position, normal, color, UV and index buffers remain untouched. Original
materials remain unchanged. New trim and mullion materials clone the original
material properties and use exact samples of colors already present in the
corresponding source's vertex attributes. They are linear RGB values, matching
Three.js vertex-color interpretation:

| Building | Trim sample | Mullion sample |
| --- | --- | --- |
| Courant | `[0.266355604,0.219526201,0.181164250]` | `[0.124771819,0.086500458,0.072271854]` |
| Stern | `[0.545724452,0.527115107,0.479320168]` | `[0.234550580,0.242281124,0.226965874]` |

Courant retains its reddish/brown facade and dark glazing. Stern retains its
existing cream/stone facade and blue-gray glazing. The new surfaces naturally
add a small amount of the existing trim color around the unchanged panes.

## Algorithm and API

`src/courant-stern.js` exports `enhanceCourant(model)` and `enhanceStern(model)`.
Each augments the loaded GLB root in place and returns that same root. Call before
`registerLandmark`, so existing whole-building highlight and raycasting include
the additions. No asset replacement or tile removal is needed.

The builder identifies glazing by its exact source color signatures and joins
triangles by position to recover individual shallow window boxes. Broad vertical
faces supply each window's normal, width, height and orientation. A short ray
against the original model discards the face buried in the facade or an occluded
pane. Narrow borders follow the existing edges; mullions divide sufficiently
wide/tall panes, and the bottom strip projects slightly as a sill. No glass is
duplicated, recolored, moved or covered by a second pane.

Two merged detail meshes are appended per building, rather than one object per
window. Geometry is transformed back into the provided root's coordinate space.
The root keeps its existing transform and stable selection identity. Repeated
calls are idempotent. `root.userData.windowDetailing` records measured counters,
palette samples and the method. A changed source palette fails explicitly rather
than silently applying these signatures to unrelated geometry.

## Actual checks

`node --check src/courant-stern.js` passed. Independent local Node execution with
Three.js GLTFLoader instantiated the actual source files. SHA256 comparisons of
all original attribute/index arrays and serialized original materials matched
before and after enhancement. A second call added nothing. Git showed no changes
to either original GLB.

| Building | Detailed window components | Exposed detailed faces | Added meshes | Added triangles |
| --- | ---: | ---: | ---: | ---: |
| Courant | 370 | 370 | 2 | 26,640 |
| Stern | 1,073 | 1,095 | 2 | 78,288 |

Stern includes a small number of thin freestanding glazing components with both
broad faces exposed; both receive the same edge treatment. Its remaining25
components were occluded or outside the conservative size criteria. Both complete
building bounds were exactly unchanged after detailing. Approximate Node CPU
construction times were167ms for Courant and1,052ms for Stern on this machine;
these are not browser frame-rate measurements.

## Limits and handoff

This is a stylistic detail pass on the source geometry, not a surveyed facade
reconstruction. Frame width (3.5–6.5cm), mullion width and sill projection are
inferred for close-range map legibility. The existing baked pane locations and
building colors remain authoritative. Independent before/after browser images,
interaction and performance checks are required for final visual acceptance.
The parent owns integration, folder guides and the milestone journal.

Final browser verification passed eight checks and independent source-buffer/
palette checks. The measured desktop startup was2,340ms versus601ms previously,
about1.7seconds extra for runtime extraction. The sampled RTX5060Ti view retained
approximately165FPS,412 draw calls and427,058 visible triangles. These are local
desktop observations; actual mobile hardware remains unmeasured.
