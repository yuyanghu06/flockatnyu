# Landmark highlight behavior

## Authoritative source inspected

The user supplied `https://github.com/yuyanghu06/yuyang-site.git` after the local
reference lookup failed. Connected GitHub read-only tools successfully retrieved
source at commit **964408fb988786be80005dc8e59e81bc19f657d3**. This supersedes
the provisional radial-halo approximation and its two-active-building limit.
No reference repository files were changed or cloned.

Files actually read:

- [AGENTS.md](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/AGENTS.md):
  available and read. Its relevant geometry-integrity instruction requires
  complete base-plus-detail landmarks for interaction, bounds and movement.
  The repository tree exposed no additional nested AGENTS.md for these modules.
- [src/components/map/manhattan/navigation.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/manhattan/navigation.ts):
  `createBuildingGlow` clones landmark surfaces into root-local coordinates and
  uses a shared transparent additive MeshBasicMaterial.
- [src/components/map/animation/landmarks.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/animation/landmarks.ts):
  lift, opacity and hue animation equations.
- [src/components/map/runtime/map-runtime.tsx](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/runtime/map-runtime.tsx):
  registration attaches glow to each complete root; frame delta caps at 0.05 s
  and interaction ease is `1-exp(-delta*9)`.
- [src/components/map/shared/rendering.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/shared/rendering.ts):
  source renderer context, not copied wholesale into the campus renderer.
- [src/components/map/manhattan/neighborhoods/landmarks.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/manhattan/neighborhoods/landmarks.ts):
  confirms the source merges complete landmark geometry before interaction.

## Current behavior: steady highlight and both selected indicators

The earlier hover-outline proposal was cancelled. A later explicit request adds
both a persistent selected-building silhouette and a ground footprint ring. Hover
retains the accepted white surface highlight; selection keeps that highlight when
the pointer leaves. There is no pulse, hue cycle, floating pin or building lift.
Original materials, geometry, root positions, camera behavior and avatars stay
unchanged.

`landmark-effects.js` preserves its smoothstep 350ms fill fade-in and 280ms fade-out,
with reversals from the current strength. A two-material pool and at most two
crossfading surface views avoid shader churn. The selected ID is independent of
that fill's active ID: selecting the currently hovered building adds the selected
indicators without restarting the fill; deselecting while still hovered removes
the indicators while preserving the fill.

Both selected indicators enter together over a 330ms smoothstep envelope. The
outline fades in, and the ground band fades while spreading from 55% to 100% of
its final outward distance from the fixed footprint edge. Ring-owned morph targets
perform this expansion without scaling the footprint into walls or rebuilding
geometry each frame. No selected-ID change means no replay during pointer events,
camera motion or polling. Clearing/switching immediately retires the old ring;
reduced motion applies and latches the final state immediately, so changing back
to normal motion does not replay or retreat an entrance. On the first frame after an outward focused-camera return begins, main.js clears
selection through the normal selection path, immediately removing both indicators
while preserving any current ordinary hover fill. The existing camera return
continues without restarting. Ordinary inward zoom and a newly focused different
building do not trigger this cleanup.

## Selected silhouette

`landmark-outline.js` renders borrowed static/instanced mesh views of the complete
selected root into one lazily allocated union mask with depth. It shares source
geometry and instance matrices, follows world transforms/visibility and excludes
map decorations. The complete union interior is subtracted, so shared mesh seams
and individual facade edges do not become lines.

The mask uses up to DPR 2, a 4096px maximum dimension, up to four MSAA samples and
resolved depth. Linear resolved coverage produces a roughly 2 CSS-pixel white
perimeter with a subtle additional 0.75-pixel dark understroke. A transparent quad
is cropped to the projected complete-root bounds. Its fragment depth comes from
nearby selected-mask depth and tests against the original beauty framebuffer's
retained depth, hiding occluded lines. There is no beauty render target,
EffectComposer, palette/tone-mapping change, full-scene depth rerender or CPU
readback. This integration uses the existing standard WebGL perspective depth.

The render hook is immediately after the unchanged beauty render and before avatar
projection updates. Target switching restores target-specific viewport/scissor;
clear color/alpha, automatic clear, XR and render-info reset settings are restored.
No selected ID means no extra render calls. A single target is retained for reuse,
resized within the cap and disposed with the controller. High-DPI MSAA allocation
and actual GPU timing remain browser measurements rather than inferred guarantees.

## Ground footprint ring

`landmark-footprint.js` creates two ordinary depth-tested, non-raycastable meshes
outside the building base. The white band is 1.15 world meters wide, with an extra
0.20m charcoal edge. It sits at map Y 0.80m, above the mapped paving maximum of
0.76m, with tiny separate band elevations/polygon offsets against z-fighting.
Both materials remain transparent, unlit, single-pass and in dark-then-white draw
order throughout entrance. Normal scene depth hides the marker behind buildings
or higher ground; it does not draw through walls.

Silver, Kimmel, Global Center and Leslie use their existing authoritative replacement
footprints. Paulson and the arch receive their existing placement footprints through
optional registration metadata explicitly marked `footprintSpace: 'world'`, since
those map-coordinate polygons must not receive the arch root's placement twice.
Replacement-model polygons use root-local coordinates.
Bobst and Courant use a conservative convex hull of the actual lowest geometry
band, retaining rotation instead of using an axis-aligned rectangle. That fallback
can bridge concave recesses and is not a surveyed building boundary.

Stern uses only two small baked source contours from `building-runtime.json`,
indices 11005 and 11632, rather than the global lowest-Y slice that omitted its
higher-base front wing. Clipper union preserves their concavity and two disjoint
components. Offset-band differences retain each component's correctly owned holes;
entrance morphs measure outward distance to actual contour segments rather than
joining the two parts. The complete source area is 3559.5262475m², with map maxima
X119.410/Z247.555. Gould Plaza remains excluded from Stern's ground footprint,
while remaining in its selected highlight and silhouette. The full source dataset
is not imported for this small contour constant.

Ring geometry is independently owned, removed on deselection/switching and follows
root transforms without affecting source bounds, picking or geometry ownership.

## Controller contract and verification

`createLandmarkEffects({scene,reducedMotion})` provides `register(id,root,{footprint,footprintSpace})`,
`setActive(hovered,selected)`, `update(delta)`, `renderOutline(renderer,camera)`,
`snapshot()` and `dispose()`. Footprint metadata is optional. Register only after
complete building assembly. The snapshot exposes selected ID, entrance strength,
ring footprint/source/approximation and outline target/sample diagnostics.

Disposal releases only effect-owned materials, ring/morph/quad geometry and mask
resources. Original geometry and shared instance buffers are never disposed through
views. Syntax, production build and targeted ownership/selection/entrance checks
pass locally; actual pixel, occlusion, DPR, camera and ring-fit acceptance belongs
to the independent browser evidence. Earlier cancelled outline and steady-fill
passes remain historical.
