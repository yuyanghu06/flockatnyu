# Supplemental park vegetation

`src/park-vegetation.js` adds restrained illustrative trees and low planting to
explicit OpenStreetMap vegetation cover inside actual park boundaries. It never
interprets every land-cover record or a whole park boundary as plantable lawn.
No tree locations or species are presented as a surveyed inventory.

## Build and integration

Run `node scripts/build-park-vegetation.mjs` from the project root. The build reads
the local streets/parks snapshot, prepares the existing street/building exclusion
polygons, and writes:

- `campus-assets/models/environment/park-vegetation.glb`
- `campus-assets/data/park-vegetation-render.json`
- `evidence/m10-park-vegetation/coder-checks.json`

`main.js` loads the GLB as an environment group at identity transform. Geometry uses
the shared Washington Square X/Z meter coordinate space and Y-up convention.
This adds four material meshes; no runtime placement calculation is needed.
Source assets remain unchanged. Existing trees must remain loaded.

The module exports `planParkVegetation(data, prepared, existingExclusions)` and
`createParkVegetation(data, prepared, existingExclusions, plan)`. The build script
reads actual world bounds from every mesh in the runtime-loaded Washington Square
trees, Courant garden and Washington Square fountain GLBs. It also creates the
current procedural Gould Plaza offline and protects its whole footprint. Those
246 conservative X/Z boxes are included in metadata for independent verification.
The unused Union Square/Gramercy and Manhattan context tree exports and obsolete
Gould GLB do not constrain planting. It does not skip a whole park just because
existing trees occur somewhere inside it.

## Placement rules

Eligibility requires explicit grass, garden, flowerbed, meadow, woodland, or
similar vegetation cover intersected with a `leisure=park` part. Elevated/roof
parks are excluded. Park holes and the loaded map rectangle are respected.
Buildings, buffered streets, sidewalks, curbs, pedestrian routes, sports/play
surfaces, hardscape, water and fountains are subtracted. Exclusions are applied
sequentially: unioning the complete interlocking road/building network was
unnecessarily expensive. The existing 1mm integer polygon helpers are reused.

Each entire crown disk must fit within the remaining polygon with .45m clearance.
It must stay .75m beyond existing mesh boxes; new crowns have at least 1.25m gap.
Seed 104729 and stable park IDs produce repeatable, slightly varied positions.
Trees have 2–3m crown radii and 5.5–8m heights; shrubs have .65–1m radii and .7–1.15m
heights. The base is Y=.715, matching the raised park surfaces. Muted green foliage
and brown trunks use low-detail geometry merged into four meshes.

Density targets are one tree per 550m² and one low planting per 180m², capped at 28
trees and 22 shrubs per park part and 500 additions overall. Failed candidates are
omitted rather than relaxing clearance or placing vegetation on unmapped ground.
The saved audit explains every park's result, including zero-addition cases.

## Actual coverage and checks

The existing environment reports 52 rendered park parts and 558 rendered surface
parts; the latter includes gardens, lawns, sports areas and water, not 558 parks.
The raw snapshot has 564 surface records, including 53 actual park parts. One park
part lies outside the loaded rectangle and the High Line is elevated: 52 ground
source parts and 51 ground parts intersect the map. These counts differ from
the existing park renderer's 52 rendered park parts because it includes the
High Line record; surface records are not a count of public parks.

This pass adds 72 trees and 117 shrubs in 21 park parts, including gaps in
Washington Square, Union Square, Gramercy and smaller neighborhood parks.
29 parts lack explicit eligible cover after exclusions; one further part is
too narrow/occupied/spacing-constrained. No unsupported planting is invented
to make every park's count nonzero. Audit IDs distinguish multipart parks.

The baked result has four meshes, 17,136 triangles and 1,237,144 bytes. The build
took approximately 10 seconds in the available Node environment. It checks two
independent calls produce identical placement arrays, all crown containment and
existing-box exclusions, new-crown spacing (minimum observed 1.335995262m), finite
vertices, loaded-extent bounds, and SHA-256 preservation of all five source files
(snapshot, three runtime GLBs and the current Gould generator). A second full bake
produces a byte-identical GLB. Reading the fountain emits an optional unlit-material
extension warning; this exclusion pass reads vertex positions and transforms only.

Full metadata includes placements, source hashes, existing exclusion bounds,
per-park counts and check results. These are source/geometry checks. Browser
appearance has not been verified in this pass. OSM mapping completeness and
conservative bounding boxes can leave otherwise plausible gaps unplanted;
neither exact landscaping nor public access is inferred from the additions.

