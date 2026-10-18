# Streets and pedestrian surfaces

`src/streets.js` turns the locally captured OpenStreetMap network in
`assets/campus-assets/data/streets-parks.json` into identity-transform map geometry.
Coordinates are Washington Square X/Z meters, matching the existing buildings.
The snapshot owns source attribution and provenance; this renderer does not fetch
data or modify original assets.

## Integration contract

- `prepareStreetSurfaces(data)` prepares clipped, unioned MultiPolygon arrays.
- `createStreets(data, prepared)` returns a THREE.Group containing four merged
  material meshes: asphalt, pedestrian paving, curb faces, and crossings.
- `prepared.pathFootprints` contains the complete pedestrian footprint, including
  park entries. Subtract it from park base and cover layers to expose the ramps.
- `prepared.roads` supports park/road separation; `buildingFootprints` is the
  union of supplied building exclusions. All polygon arrays use `[polygon][ring]
  `[point][x,z]`, with outer ring first and holes afterward.
- Exported `unionStreetPolygons`, `subtractStreetPolygons`, and
  `intersectStreetPolygons` share that contract. `containsPark` tests containment.

The orchestrator's build tool can bake the generated scene into GLB, keeping
polygon preparation and the raw network snapshot out of browser startup.

## Geometry and grade choices

Road carriageways and sidewalks follow actual OSM line vertices. Width tags are
used when present, otherwise lane counts or restrained highway-class defaults
provide approximate widths. These are visual estimates, not surveyed curb lines.
Explicit sidewalk presence/side/width tags are respected. Pedestrian `area=yes`
features become filled polygons. Ground-level footways, pedestrian ways, paths,
steps, and cycleways share simple paving; steps are not modeled as individual
treads. No lane striping or moving traffic is generated.

Mitered buffers are unioned before subtraction, giving continuous intersections
without stacked coplanar strip meshes. Sidewalks exclude the carriageway, curbs,
and explicit pedestrian paving. Curbs have vertical faces and openings where
pedestrian paths cross them. Pedestrian crossings use a small height offset.
All surfaces clip to the loaded extent and original building footprint union.
Washington Square fountain way `959929617` is excluded from every surface so the
existing fountain model remains visible.

Boolean operations use Clipper's integer coordinates at 1mm resolution. Standard
topology mode is intentional: its optional StrictlySimple postpass was extremely
slow on this overlapping city footprint set. No exception handler silently drops
features. Repeated clipping may produce submillimeter edge-rounding slivers.

Road surfaces are at Y=.02, sidewalks .16, curbs .20, outside paths .18, and park
paths .76. Park entries transition over three meters inside the unioned green
area boundary. Unioning covers removes internal lawn edges from grade lookup.
A spatial edge grid accelerates the distance calculation; subdivided path
triangles make the height transition visible. These transitions approximate a
continuous visual ground surface; they are not measured accessibility ramps.
Tunnel, bridge, indoor, nonzero level, and nonzero layer ways are omitted rather
than incorrectly flattened into surface streets.

## Implementation checks and limits

The actual snapshot produces 1,065 road ways and 3,696 pedestrian ways; 69
grade-separated ways are omitted, accounting for all 4,830 source ways. Widths
are inferred for 4,737 ways. All 6,501 source building polygons participate in
exclusion. The resulting street group has four meshes and 197,888 triangles.
Measured Node preparation took approximately 6.2 seconds; geometry creation took
220ms after spatial indexing. This work is intended for the offline bake.

Node checks inspect source counts, finite vertices, loaded-extent bounds, fountain
exclusion, and building intersections. Repeat-intersection fragments at building
boundaries are below .01 square meters each (largest observed .00614 square
meters), consistent with the 1mm integer rounding. Initial zero-fragment assertion
was too strict for repeated quantized clipping and was replaced with this stated
tolerance; material building intrusion is not accepted.

Browser inspection of junctions, park entries, alignment, and close zoom remains
the independent tester's responsibility. Original CityGML roofs can overhang
their footprint exclusions; OSM completeness and inferred widths limit exact
real-world curb alignment. Existing elevated garden/plaza geometry is preserved
by the integrator and may obscure paths underneath it.

M7 depth correction: crossing footprints are cut out of asphalt rather than drawn only 8 mm above it. Only the background ground material receives positive polygon offset (factor 1, units 4), keeping it behind asphalt during zooming and panning while preserving the standard depth pipeline for architecture. Source positions and palettes are unchanged. Rebuild the environment after generator edits.
