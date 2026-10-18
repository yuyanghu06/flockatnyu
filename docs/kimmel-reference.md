# Kimmel Center facade reference and integration

This model represents NYU's Helen and Martin Kimmel Center for University Life
at **60 Washington Square South**, including the Skirball frontage in the same
building. It is not NYU Langone's Kimmel Pavilion, Philadelphia's Kimmel Center,
or the separate Global Center for Academic and Spiritual Life next door.

## Sources and visually inspected photographs

- [Mendoza Architects: New York University Kimmel Student Center](https://www.mendozaarch.com/projects/new-york-university-kimmel-student-center).
  The practice's page credits its photographs to Kevin Roche John Dinkeloo and
  Associates and identifies the cable-net glass entrance. Both supplied photos
  were downloaded and visually inspected. The exterior shows the northeast
  corner: warm pale masonry, paired vertical windows, exposed blue-green glazed
  corners, upper glass setbacks, a low podium and railings. The other image is an
  **interior view of the stair hall**, useful only to establish the glass entrance
  and curved overhead glazing, not exterior massing.
- [Atlantic Coast Partners: Helen & Martin Kimmel Center](https://atlanticcoastpartners.net/portfolio/new-york-university-the-helen-martin-kimmel-center-for-university-life/).
  Its project page identifies NYU and Roche Dinkeloo. The exterior image was
  downloaded and visually inspected: this is the narrow **north, park-facing
  elevation**, with a tall central glass opening in the upper masonry facade,
  glazed corners, stepped crown and curved glass entrance below.
- [MEET NYU: Kimmel Center for University Life](https://meet.nyu.edu/locations/kimmel-center-for-university-life/)
  confirms the identity and student-life role, including the attached Skirball
  Center. [NYU Tisch's Kimmel windows exhibition](https://tisch.nyu.edu/photo/events/show-one-2021.html)
  confirms display windows along LaGuardia Place and West Third Street; the model
  uses simplified display bays without reproducing temporary art or posters.

Photo files, with corrected orientation labels:

- `evidence/m4-campus-details/reference-kimmel-northeast.jpg`: Mendoza exterior,
  credited there to Kevin Roche John Dinkeloo and Associates.
- `evidence/m4-campus-details/reference-kimmel-interior-stairhall.jpg`: Mendoza
  interior, same source credit.
- `evidence/m4-campus-details/reference-kimmel-north.jpg`: Atlantic Coast Partners
  north elevation photograph.

These files are research evidence, not bundled textures. Copyright remains with
the original rights holders. The exterior photos do not establish today's entrance
layout, temporary controls or current access. Window sizes, bay counts and exact
material colors in the model are approximate; no survey accuracy is claimed.

## Identification and source geometry

The campus source footprint is **11652** in
`assets/yuyang-site-3d-assets/data/building-runtime.json`; its CityGML massing appears in
`models/buildings/city-tiles/tile--1_0.glb`. The adjoining western footprint **11021**
belongs to the Global Center and remains separate. The geometry was decoded with
NodeIO and Meshopt, with all node world transforms applied.

The source sits roughly at X -77.35..-19.39 and Z 81.26..151.91. Its occupied
base datum is about Y=1.525 and roof maximum Y=51.416. The source has a low podium,
an asymmetrical taller mass, upper setbacks and a separate lower southern volume.
Those triangles are retained exactly; a generic cuboid does not replace them.

Raw inclusive footprint matching finds 222 triangles. Some are neighbor faces
on shared boundaries. The Kimmel matcher retains **200** triangles by checking:

1. All three world vertices lie within the Kimmel footprint with source rounding
   tolerance, and within the Kimmel vertical range.
2. On a boundary, the wall normal points out of Kimmel rather than out of the
   Global Center. The opposite-oriented neighbor faces are left in the tile.
3. The triangle centroid also belongs to Kimmel, excluding the neighboring roof
   that bridges the concave notch despite its vertices touching Kimmel's boundary.
4. Near-zero-plan-area horizontal slivers are not treated as Kimmel roof areas.

The raw candidate set includes 14 opposite-facing neighbor walls, three below-
Kimmel-ground sliver triangles, four near-zero-plan roof slivers and one neighboring
roof across the concave notch that are left untouched. Because geometry on shared
boundaries can satisfy both footprint tests,
**do not use the general `removeReplacedBuilding` helper for Kimmel**.

The source GLB is unchanged. Runtime extraction and removal operate on the loaded
scene only. The new foundation fills the footprint from map ground Y=-0.12 to the
source base datum; it does not move the existing entrances or rooftop geometry.

## Facade approach

Facade panels follow the source wall endpoints and height ranges. The main north,
east and south elevations receive paired windows with pale trim, center mullions
and small sills. The photo's solid middle-story panels on the long east elevation
remain solid. Party walls toward the Global Center retain their source massing.

The crown uses a subdued green-gray panel grid on the source's upper setbacks.
Thin corner glazing strips, the tall central north opening and a curved glazed
entrance canopy make the model recognizable at campus viewing distances. The
street-level display bays are simplified; no temporary advertising is invented.
Only the exterior is modeled. The photographic interior is not reproduced as a
walkable space, and no current opening or access claim is made.

The source crown is coarser than the photographed glass envelope; details follow
that source rather than inventing a surveyed sloping roof. Fine dimensions,
unseen elevations, exact glazing reflectance and interior construction remain
approximations. The materials use consistent pale stone and blue-green glazing
instead of photographic textures. Geometry is merged by material into seven
meshes under one selectable root, including the base and entrance details.

## Integration contract

```js
import { createKimmelModel, removeKimmelGeometry, kimmelReplacement } from './kimmel.js';
// While loading kimmelReplacement.tile, before removing its matching geometry:
const building = createKimmelModel(tileRoot);
const removed = removeKimmelGeometry(tileRoot);
building.userData.buildingId = 'nyu-kimmel-center';
// Apply the application's standard material/highlight registration to building.
```

The model root is identity. Coordinates are Washington Square meters, Y up;
do not recenter, rotate or apply another placement transform. Use the complete
group for selection, hover, bounds and focus. Its `userData.architecture` contains
source-triangle, window, crown-panel and display-bay counts plus this document path.

## Actual checks

`node --check src/kimmel.js` passed. A NodeIO/Three.js check decoded the source tile,
built the model, and removed exactly 200 matching triangles: the tile changed from
2,598 to 2,398 triangles. Model creation took approximately 31 ms in this Windows
session and produced seven meshes and 19,316 triangles: 229 paired window units,
350 crown panels and 25 simplified display bays. The root transform is identity.

Model bounds are approximately `[-77.5275,-0.12,81.2640]` to
`[-19.1112,51.4639,152.1916]`; the small expansion beyond source massing is facade
trim. Results are saved in `reference-kimmel-geometry-check.json`. These checks
establish geometry and replacement behavior, not final visual acceptance.
An additional neighbor audit found 88 Global Center triangles before and after
replacement, with zero lost; see `reference-kimmel-neighbor-check.json`.
Integrated browser appearance, alignment, hover and selection are delegated to
the independent tester.
