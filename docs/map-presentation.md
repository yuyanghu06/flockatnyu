# Map presentation and camera controls

The live page displays only the map canvas. Existing control DOM remains hidden
for compatibility, including status, building menu, camera dialog, hover label
and attribution. Source attribution is retained in index.html and project docs.
Click/raycast selection and hover still operate on complete landmark roots.
Developer inspection is available through window.__map: snapshot, project,
select, focus, restoreCamera and reset. These are debugging APIs, not visible UI.

## Adjustable appearance

src/map/data/config.js owns palette.context, skyTop, skyHorizon and ground colors. The steady white hover/selection highlight and smooth fade are configured in
landmark-effects.js; selected buildings retain it through camera movement.
Generic city tiles use a uniform gray material with vertexColors disabled; source
vertex data and detailed landmark materials are retained. src/map/environment/atmosphere.js adds
an analytic sky, distance fog and world-space boundary fade. Fog starts at 430m
and ends at 1050m; the last 220m inside mapExtent blend into haze. Both sky and fog
evaluate the same world-direction gradient, including instanced/batched geometry.
The edge shader adds no geometry or render passes; a fullscreen triangle draws
the sky once. Unseen GPU behavior still needs browser validation; this is not a
measured performance claim.

### Coherent sky and haze

The earlier 1×256, eight-bit gradient varied by screen height while fog blended
to one constant horizon color. At full fog, an object could therefore meet a
different background color at the same pixel. Its gradient lookup also quantized
the palette before rendering. Merely increasing fog density would not correct
that mismatch.

`MAP_SKY_GLSL` now supplies the identical analytic function to the sky and material
fog shaders. It interpolates the existing palette in Three's linear working
space using `smoothstep(-0.12, 0.8, normalize(worldRay).y)`. The flat lower region
and smooth transition keep the horizon soft without changing palette endpoints.
Sky rays come from inverse projection and camera world rotation, updated before
each draw; fog rays come from each surface's world position minus camera position.
Orthographic cameras use their shared forward direction. Camera pitch and zoom
therefore change both evaluations consistently.

Three applies its material fog chunk after tone mapping and output conversion.
The replacement uses `linearToOutputTexel` on the shared linear gradient exactly
once at that stage. The sky is `toneMapped=false` and performs the same conversion,
so ACES exposure cannot separately transform the background target. Distance and
edge factors combine as `1-(1-distanceFog)*(1-edgeHaze)`. Either fully opaque haze
factor reaches the same sky color along that ray; the original fog distances and
edge width remain unchanged.

Three's standard, screen-stable sub-LSB dithering runs after this conversion on
both paths, reducing final framebuffer banding without animated noise. The sky
is a nonpickable `mapDecoration`, has no depth test/write, cannot be frustum culled,
and draws before map geometry. `scene.background` is null. `createMapAtmosphere`
still returns `{apply, sky}`, but `sky` is now a Mesh rather than a DataTexture.
Material compile hooks and custom cache keys are chained; repeat application
does not install duplicate hooks, and decorations/fog-disabled materials are skipped.

The change removes the 1,024-byte lookup texture and adds a three-vertex position
buffer (36 bytes) plus small matrix/color uniforms. There is one background draw,
as with the previous textured background; the arithmetic adds per-fragment work
but no offscreen render target or extra geometry pass. No measured FPS or GPU
memory claim is made. Targeted Node checks patch Three's actual standard shader
and verify shared code/uniforms, hook chaining, idempotence, camera uniforms,
output-conversion ordering and background state. They do not compile a GPU shader
or establish visual acceptance.

src/map/landmarks/landmark-effects.js owns nonpickable shared-geometry surface highlights.
The current white highlight uses smooth fades and keeps architecture stationary. See hover-reference.md for retrieved source behavior, adaptation
limits and reduced-motion behavior. Existing lighting was not retuned in this pass.

## User camera mapping

cameraSamples stores the exact supplied A/B/C vectors. A and B define polar tilt
limits, approximately 0.3945–48.3263 degrees from vertical; azimuth stays free.
C supplies only a 434.2943200101m distance, used for initial/reset distance and the
maximum OrbitControls distance. The latest supplied screenshot guides the default
composition: Washington Square Park in the foreground, fountain and arch low in
frame, Silver on the left and Bobst/Kimmel beyond the park on the right. The
chosen target is `[74,12,116]`, with azimuth -172 degrees and the A tilt endpoint.
This framing bias replaces the earlier generic park-center/previous-angle plans.
It approximates the screenshot's composition; no exact pose recovery is claimed.
At the reference landscape aspect the arch falls near the lower frame edge.
Narrow viewports retain the agreed distance cap, so composition can crop.
Initial load has no selection; Reset clears selection/hover and uses this same pose.
C's target, azimuth and 60-degree tilt are deliberately not used as a default pose.

Initial/reset retains those overview limits. A building closeup uses 65 degrees
from vertical with a focused-only 78-degree maximum; zooming out restores the
overview range smoothly. See camera-navigation.md for front directions,
motion research, discrete and fine zoom, and interruption behavior.
Restoring an out-of-range overview camera
rejects it with a useful error instead of silently accepting another range.
The hidden camera UI can be replaced later without changing this contract.

## Verification status

M11 source checks and motion traces are recorded in evidence/m11-atmosphere-navigation;
earlier checks remain in evidence/m9-presentation. Browser
access remains denied, so live shader appearance, hover motion, frame rate and
pointer/camera interaction are not claimed as visually verified. The earlier
production build failed at a realpath EPERM for existing streets-parks.glb;
this pass does not work around that permission restriction or alter the user's
running server. The separate GCASL pass received user live appearance approval.
