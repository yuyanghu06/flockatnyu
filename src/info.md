# Current administration boundary

Discord administration configures live-readable channel metadata. It has no archive date, retention claim or backfill control. Disabling a channel prevents reads and event ingestion; migration020 preserves that intent through discovery. The assistant reports live Discord/Google/Miro readiness without retired generic knowledge storage status.

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

M6: streets.js and parks.js generate offline street/park geometry. scripts/build-streets-parks.mjs bakes the model; main.js loads the result, replacing old coarse grass.

M7: main.js biases only the background ground plane behind street surfaces; streets.js removes asphalt beneath crossings instead of using near-coplanar overlays.

M8: global-center.js replaces exactly88 GCASL source triangles with six merged meshes, preserving Kimmel and neighbors. main/config register nyu-global-center as the eleventh landmark.

M9: atmosphere.js adds sky and edge haze; landmark-effects.js animates complete landmark roots. config.js contains exact camera samples and shared limits. Generic city materials are neutral; detailed model palettes remain intact.

Final M9 effect follows yuyang-site commit964408f: merged additive surface overlays with hue/pulse, selected suppression and4.5mhover-only lift. This supersedes provisional sprite halos/emission. Decorations are separate nonpickable scene roots; underlying landmark materials remain unchanged.

Current M9 supersedes idle/selected glow: only hovered roots show their overlay. camera-focus.js owns front focus, bounded scripted motion and focused tilt; map-interactions.js owns captured wheel routing while native pinch remains enabled. M10 park-vegetation.js is an offline generator; main.js loads its merged GLB at identity.

M11: atmosphere.js replaces texture sky with one analytic triangle matching fog rays/output color; camera-focus.js stores pre-focus overview for reverse exit; map-interactions.js preserves wheel deltas. config.js default matches supplied park-foreground composition. assets/main restore neutral25UnionSquareWest and235ParkAvenueSouth models and neutralizeLipton, retaininggeometry.

M12: map-resources.js compacts neutral context buffers exactly and freezes static local matrices; main.js caches picking and exposes bounded timing diagnostics.

M21 supersedes the M13/M20 entry UI: bootstrap.js catches startup failures; loading-state.js still gates real resources/scene readiness; map-startup.js automatically opens the map and uses only the small static status/retry notice in index.html.

- assistant.js / assistant.css provide the M24 floating Spotlight assistant after automatic campus readiness: native modal, query-first compact layout, Cmd/Ctrl+K, focus restoration, editable offline drafts, streaming/cancellation and safe sources. chat-client.js owns the bounded HTTP/NDJSON transport and truthful connection failures. Closing stops unfinished replies; see docs/assistant-backend.md for server setup and boundaries.

M16: discord-admin.js/css and discord-admin-client.js power the standalone /admin.html channel settings page without loading the map. API authorization stays on the server; no credentials or grant management are exposed in the browser. chat-client.js enforces aggregate history/UTF-8 budgets.

M19: building-views.js configures screenshot-derived original azimuth/polar and height factors for eight buildings. camera-focus.js derives the lower viewing angle while retaining the original full-building zoom distance, following the user's zoom feedback; it uses the full-building target except for Stern's rotunda presentation anchor. map-interactions.js shares focused outward wheel return between canvas and window, with native overlay scrolling outside focus and loading gates.

Stern uses a view-only rotunda anchor with the original full-building zoom; its earlier explicit close distance is removed. Off-canvas outward return preserves hover coordinates and does not introduce picking.

M20 decorative loader is removed at the user’s request. M21 keyboard-pan.js provides camera-relative bounded WASD with typing/modal/modifier/blur guards. Bobst and Silver profiles use distanceScale1.2. main.js registers Stern and Gould geometry as one Stern root; the plaza no longer has a separate building record. Snapshot part bounds expose grouping alignment for verification.

M23 keyboard-pan.js integrates eased ground-plane velocity for smoother starts,
releases and direction changes. Cruising speed is 60% higher (24–192 m/s), with
normalized diagonals and existing pan bounds. Short release tails stop within
250 ms; safety guards, pointer/wheel/control takeover and camera restore/focus
clear held keys and momentum immediately. Captured wheel reset covers overlay
returns, and held-key repeats cannot resurrect movement after a reset. See
docs/camera-navigation.md for the rates, exact integration and handoff contract.

M24: main.js suspends the captured map-wheel path while a native dialog is open. This lets the floating assistant scroll independently; keyboard-pan already guards dialog[open].

M24 client connection checks time out after eight seconds. Gateway/network errors use bounded actionable messages; status/configuration checks never invoke a model.

M31: Lipton Hall remains loaded at its original placement with neutral context
materials. Its entry is removed from the selectable `config.js` building list,
so it has no picker option, selection root, hover effect, focus target or debug
landmark lookup. Its meshes still occlude buildings behind it during raycasting.

M32: chat-client.js samples the browser's IANA time zone at every chat send and
includes `timeZone` in the request body. Changes during travel apply on the next
request. Detection failure explicitly uses UTC; the server validates the zone and
uses it for date-based Discord window interpretation. Message/building context
and stream cancellation retain their existing contracts.
