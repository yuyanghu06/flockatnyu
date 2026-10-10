# Build the first Washington Square campus map

You are implementing the first local preview of an NYU campus map. Work in:

`/Users/yuyang/techatnyu-internal-tooling/tech-visualized`

Read `AGENTS.md`, `milestones/milestone.md`, `milestones/to-do.md`, the latest linked history, and `docs/agent-workflow.md` before editing. Follow the repository's managed development and milestone journal instructions. Preserve existing files. Put application source directly in this project root; do not create another nested application project.

## What I want now

Build and render a detailed 3D view of Manhattan around **NYU and Washington Square Park**. Start the camera substantially closer to campus than the original site's Manhattan overview. Reuse the exported buildings and scenery and the reference site's warm, muted palette.

**Keep the camera freeform.** I will run the preview myself, manually find the angle I want, and send you that angle afterward. Enable orbit, pan, and zoom throughout. Do not lock the view to a preset, automatically rotate it, snap it back, or force a building camera angle. A sensible initial view and a reset button are sufficient for now.

This phase is a working map preview. Calendar, Discord, Drive, database, authentication, club content, and the conversational assistant come later. Do not fabricate club events or resource links. Keep this work local; do not deploy it.

## Inputs and reference

- Existing asset package: `yuyang-site-3d-assets/` in the project root.
- Read its `README.md`, `asset-manifest.json`, and `data/landmark-placements.json` before importing.
- Reference site: `/Users/yuyang/Documents/YuyangSite/backend`, with map code under `src/components/map/`.
- Read the reference site's applicable instructions. Inspect its rendering, loading, geometry placement, and camera code for useful patterns, but keep this project independent. Do not edit that repository or reuse its credentials or unrelated assistant/avatar code.
- Additional source scene: **`/Users/yuyang/Downloads/scene.glb`**. Preserve this original file.

No application, build toolchain, or Git repository existed when this prompt was prepared. Vite, vanilla JavaScript, and Three.js are a reasonable proposed starting stack, not an existing implementation. Use a lightweight local setup and document the exact commands to run it.

## Extract the missing center from the additional GLB

The user calls the building “Halcyon Center” in the spoken request. This may refer to **NYU's John A. Paulson Center**, but the identity was not yet confirmed when this prompt was written. Resolve the identity from the user's clarification before committing to the extraction; do not silently label an arbitrary building as the target.

The original campus dataset lacks the intended building. The supplied `scene.glb` contains the surrounding area, not just an isolated model of the center. Your task is to inspect that scene, identify the exact building, extract it, and use the extracted model in the campus view.

1. Inspect the complete GLB in a viewer or Blender and analyze its scene graph, mesh bounds, materials, connected components, and coordinate system. A preliminary header check found a valid GLB 2 file with 151 nodes, 150 meshes, and 50 materials; the sampled nodes have no names. Do not assume node names identify the building.
2. Identify the center from its architecture, footprint, and relationship to neighboring buildings. Use authoritative location/reference information as needed. Establish visual evidence that you have the correct building. If the identity remains ambiguous, provide an annotated preview and request clarification before treating the extraction as confirmed.
3. Extract the entire building: all associated facade, roof, glass, structural, and other visible geometry and materials. Exclude neighboring buildings and unrelated ground/scenery. If a mesh spans multiple buildings, separate its geometry carefully rather than choosing a broad crop that includes its neighbors.
4. Account for parent transforms when extracting. Preserve materials and normals, check for external dependencies, and produce a reusable self-contained GLB. Preserve the input scene unchanged.
5. Align the extracted building to the existing campus map. Determine its units, orientation, footprint, and ground height; do not assume the supplied scene shares the exported package's origin or scale. Record the derivation and the final placement transform in project-owned metadata. Use visual alignment checks to confirm that it fits its real block without floating, sinking, overlapping existing buildings, or duplicating them.
6. Save the extracted asset in this project and give it a stable building identifier once its identity is confirmed. Keep all its geometry under one transform/selection root. If adding procedural details, bake or merge them with the corresponding base geometry before exposing building interactions.

Keep evidence of the source scene, highlighted target before extraction, isolated result, and aligned campus result. Report any unresolved identification or alignment issue honestly. Do not report successful extraction from a GLB-header inspection alone.

## Existing map asset rules

- Coordinate system: Washington Square origin, meters, Y up. Generated landmarks, city tiles, and scenery already preserve the reference site's coordinates. Load them at identity and preserve internal node transforms. Do not independently recenter those assets.
- City tiles live under `models/buildings/city-tiles/`. They require **Meshopt decoding** and white vertex-color materials with roughness 1. Consult the manifest to load a bounded area around Washington Square rather than all Manhattan. A planner found that a 600-meter tile-center radius selects 32 of the 484 tiles, about 1.35 MB of GLBs; this is a useful starting extent to evaluate visually.
- Reuse the baked Lipton Hall, Courant Institute, and Stern School of Business models. They already include their detailed geometry. Other distant landmarks need not load for the first campus view.
- Bobst Library is a local-space model. Apply the authoritative placement metadata: position `[9.692, 2.688, 154.508]`, scale `[2.0732745786935034, 1.8242393943722324, 1.7595571794731963]`, rotation Y `5.71116998038469`. Preserve its materials and complete multi-mesh building.
- Normalize the original arch according to `landmark-placements.json`: center X/Z, ground minimum Y, uniformly scale to height 20.5, place at the supplied footprint centroid, and apply the recorded edge-based rotation. Do not invent another placement.
- Reuse Washington Square trees, grass, fountain, Gould Plaza, and Courant garden as appropriate. The fountain export is static. Some environment models cover a wider area; inspect bounds before choosing what to load or filter.
- The exported city tiles already omit several replacement landmark buildings. Verify replacement coverage before removing geometry or adding another base building. Tiles contain merged geometry; do not assume every building is a separate node. Investigate the new center's footprint against the existing dataset to prevent duplication.
- Keep the shared alignment between buildings and scenery. Preserve source attribution and applicable model licenses.
- **Do not add roads, FDR Drive, pier access lanes, crosswalks, park paths, or traffic.** They were deliberately excluded. River assets remain available, but do not load distant waterfront geometry solely to fill out this close campus view.
- Reference colors include ground `#aaa9a1`, grass `#9dbd7c`, and background/water `#354345`, with warm lighting. Keep the palette centralized and easy to adjust. Treat these as starting values and verify the resulting view in a browser.

## Camera and preview experience

- Open on Washington Square Park and the nearby NYU buildings, including the extracted center when its identity and placement are established. Use an oblique view with readable roofs and facades.
- Support left-drag orbit, right-drag or modified-drag pan, and wheel zoom; provide touch equivalents. Show concise control hints. Allow a broad useful range of angles and zoom levels, with only basic clipping/ground safeguards needed for usability.
- Add **Reset view** to restore the initial camera.
- Add **Copy camera** to export exact camera position, target, projection type, and the relevant projection settings as JSON. Include zoom for an orthographic camera or field of view for a perspective camera.
- Show the export in a selectable text field or panel as a fallback if clipboard access fails. Provide a way to restore a saved camera configuration, and document how I can send you my chosen angle.
- Camera controls must remain available after loading and any optional selection. Do not make fixed building focus angles a requirement for this phase.
- Keep the scene the primary visual surface. Use a small, readable UI, clear loading status, helpful asset-load failures, and responsive canvas sizing. Do not bury the map under a dashboard shell.

## Checks and handoff

Run the application locally and verify the actual browser behavior. A successful build alone does not establish map quality.

Confirm:

- Buildings, park scenery, Bobst, and arch load and align correctly; replacement landmarks do not overlap duplicate base geometry.
- The additional center is correctly identified, completely extracted, and aligned, with comparison evidence.
- The initial view focuses on Washington Square and looks readable at close range.
- Orbit, pan, and zoom work freely; reset works; camera export and restoration reproduce the same view within normal numeric tolerance.
- Loading failures are visible, resizing works, and desktop and smaller screens remain usable.
- No browser errors or missing required asset requests occur during normal loading. Report measured loading/rendering observations, including draw calls or frame performance, with the test environment stated.

Capture screenshots of the campus view and extracted building and document any material limitations. Follow the milestone journal after each meaningful pass and maintain folder guides. Finish with the implemented files, exact run command and local URL, actual checks, screenshots/evidence locations, and the steps for me to choose and send back my camera angle.
