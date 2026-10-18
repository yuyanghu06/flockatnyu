# Offline streets and parks data

`assets/campus-assets/data/streets-parks.json` is a geographic snapshot from
[OpenStreetMap](https://www.openstreetmap.org/copyright), licensed under ODbL 1.0.
The app must retain visible OpenStreetMap contributor attribution and that link.
This pass implements source data, not road widths, paving, elevation or park rendering.

## Collection and reproduction

Run `python scripts/fetch-streets-parks.py` from the repository. The script first
queries Overpass. During this pass geographic queries returned HTTP 500/406,
so the script used the official OSM map API in sixteen small bounding boxes,
then fetched full selected relations. This is a manual offline snapshot, not a
runtime network service. `--reuse` rebuilds from the retained response without
network requests. Prefer that option unless refreshing source data intentionally.

The retained response is `evidence/m6-streets-parks/reference-overpass.json`;
the filename is stable even when the official API fallback is used. Its generator
and source URLs identify the actual provider. Object versions, timestamps,
geographic coordinates, node references, relation membership and tags are kept;
irrelevant contributor account names/IDs are removed. The snapshot timestamp is
recorded in metadata. The map API has no atomic planet timestamp; `osmTimestamp`
is null rather than claiming a simultaneous historical snapshot. Original
object timestamps remain in the reference response.

API and geometry references:

- [OSM map API implementation](https://github.com/openstreetmap/openstreetmap-website/tree/master/app/controllers/api)
- [OSM API reference](https://wiki.openstreetmap.org/wiki/API_v0.6)
- [Overpass geometry formats](https://dev.overpass-api.de/overpass-doc/en/targets/formats.html)
- [Arch calibration source](https://www.openstreetmap.org/api/0.6/way/248166269/full.json)

## Coordinate contract

The geographic origin is latitude **40.73082**, longitude **-73.99733**.
The local projection is:

```text
x = (longitude + 73.99733) * 111320 * cos(40.73082 degrees)
z = (40.73082 - latitude) * 111320
```

X increases east, Z increases south, units are meters. This formula reproduces
all four OSM arch way 248166269 corners in the supplied landmark placement file
to less than 0.0005 m (the export rounds coordinates to millimeters). It is a
recovered match to the export, not a guessed park centroid or Web Mercator.
Projected data is rounded to 0.0001 m. Runtime groups must stay at identity.

The render extent is X[-960,960], Z[-960,1152]. Queries have a 100 m margin.
Only ways/outer rings whose bounds intersect the render rectangle are retained,
but their full coordinates and holes are preserved. Renderers must clip geometry
to the rectangle. A bounding-box intersection alone does not imply every point
is within the view. Relations are joined by actual shared node IDs, reversing
member order when needed. Inner rings are assigned to containing outer rings.
No unresolved rings occurred in this snapshot.

## JSON schema and observed coverage

- `metadata`: attribution, projection, extent, query, source URLs, timestamps,
  feature counts and unresolved-ring diagnostics.
- `nodes`: object keyed by OSM node ID, storing `lon`, `lat`, projected `point`
  and available tags. All rendered line/ring node references resolve here.
- `roads`: `{id, osmId, osmType, tags, nodeIds, points}`; points are X/Z pairs.
  IDs are `way/123`. Width, lanes, surface, access, sidewalk, bridge, tunnel,
  level, indoor, footway and all other source tags remain unmodified.
- `parks`: `{id, osmId, osmType, tags, rings, ringNodeIds}`. `rings[0]` is the
  outer ring, remaining rings are holes. Relations with multiple outers become
  `relation/123:0`, `relation/123:1`, etc. Closed source ways are `way/123`.
  This array contains distinct surfaces, not only park boundaries: grass,
  gardens, flowerbeds, woodland, playgrounds, pitches and water are retained.
- `buildings`: `{sourceIndex, points}` from the existing exported
  `building-runtime.json` footprints, filtered by rectangle intersection.
  These are clipping data only; they are not newly fetched building models.

Current snapshot: **4,830 road/path ways; 564 surface parts; 241 holes;
18,367 referenced geographic nodes; 6,501 source building footprints**.
Roads include 3,582 footways, 489 residential ways, 246 primary ways,
156 secondary ways, 124 service ways, 89 steps, 74 pedestrian ways,
six cycleways and two paths, plus other classified ways. These are OSM segments,
not counts of unique named streets. Washington Square Park is way 22899302;
the mapped fountain is way 959929617. Renderer integration should avoid drawing
another water surface over the existing fountain asset.

## Limits and integration decisions

OSM completeness and widths vary. Sidewalks may be separate footways or tags
on a street; default widths inferred by the renderer are not measurements.
The dataset retains indoor paths, subway steps, tunnels, bridges and restricted
access features to preserve source truth; renderer policy must distinguish
them before drawing ground-level public circulation. Layering/height is not
surveyed terrain. Do not present every park boundary as lawn: render mapped
internal surfaces and routes, respecting all holes. Small unmapped planted
areas cannot be claimed complete merely because all mapped features were fetched.

No source GLBs were modified. The source-data pass checks coordinate alignment,
ring closure, references, finite coordinates and counts. Browser placement,
visual clipping, width choices and performance require the integration/test pass.
