# Campus map application

`main.js` loads and renders the local Washington Square scene, owns map interaction
and the small HTML interface. `assets.js` explicitly imports 110 nearby
city tiles and the chosen campus assets, so production builds include this bounded area.
`config.js` centralizes the palette, initial camera and factual landmark records.
Asset placement metadata remains authoritative in the original asset folders.
`geometry.js` contains boundary-inclusive Coles geometry removal and camera input
validation. `style.css` controls responsive layout.
The grass export contains several parks in one mesh; triangle filtering restricts
it to the campus radius. Resize handling is active throughout asset loading.

Run `npm run dev -- --host 127.0.0.1` at the repository root. `npm run build` creates
the production preview; `npm run preview -- --host 127.0.0.1` serves that build.
The map has free orbit, pan and zoom. Selection preserves the current camera;
Focus on building is optional. Camera angle opens exact JSON export and restore.
Copy it and send the JSON with angle feedback. If clipboard access fails the
selected text can be copied manually. Camera dimensions adapt to the viewport.

The user's supplied camera determines only the starting 240.9752133-meter zoom
distance. The start retains their target and uses a campus-facing oblique angle;
no angle is locked during navigation. Tiles span X -960..960 and Z -960..1152.
Pan targets stay within X -430..430, Z -430..650 and Y 1..150 meters, with a
15..700-meter camera distance. The inset retains surrounding context. At a pan
boundary, camera and target translate together, preserving zoom and viewing angle.
Ground safeguards keep the camera above ground. Camera restore rejects views
outside these limits with a helpful message; valid saved views round-trip normally.

The scene uses Washington Square coordinates in meters, Y up. Generated models
load at identity; original Bobst and arch assets use their recorded transforms.
The procedural Paulson model is already in map coordinates
and receives no additional placement transform; its complete geometry shares the
same selection root. The original extracted source asset remains unchanged.
Coles triangles are removed only in the recorded tile, using
the complete recorded footprint, its boundary and height range. Paulson is an
architectural approximation with a podium and separate detailed towers. No roads, traffic,
backend, integration or fabricated club activity is included.

The read-only `window.__map.snapshot()` exposes load state, errors, camera, landmark
bounds, detail counts, navigation limits and frame draw counts for verification.
`project(id)` supplies a landmark’s
screen-space bounds center; it may be occluded by another building.

M3 modules: silver-towers.js, leslie-elab.js and gould-plaza.js build merged, selectable photo-informed architecture. main.js handles source replacement and registration; config.js contains all nine landmark records.

M4 correction: silver-towers.js is retained as an unused historical implementation; main.js no longer imports it or removes tower source geometry. Active target is silver-center.js, alongside kimmel.js. Gould now includes requested planter trees and shrubs.

M5: courant-stern.js adds merged window frames, mullions and sills to existing Courant/Stern roots before registration. Source meshes/material colors remain unchanged; no new facade palette or glass planes.

M6: streets.js and parks.js generate offline street/park geometry. tools/build-streets-parks.mjs bakes the model; main.js loads the result, replacing old coarse grass.

M7: main.js biases only the background ground plane behind street surfaces; streets.js removes asphalt beneath crossings instead of using near-coplanar overlays.
