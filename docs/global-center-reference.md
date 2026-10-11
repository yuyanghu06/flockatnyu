# Global Center for Academic and Spiritual Life

`src/global-center.js` models the separate NYU Global Center beside Kimmel.
It makes the existing coarse city mass into a complete selectable landmark;
the diagnostic pass did not find that Kimmel had deleted its source geometry.
All 88 Global Center triangles were present before and after Kimmel removal.

## References and fidelity

- [Machado Silvetti project description](https://www.machado-silvetti.com/new-york-university-global-center-for-academic-and-spiritual-life)
  identifies the 2012 building and a tree-inspired laminated quartzite facade,
  with waterjet-cut panels progressing from solid lower levels to an open upper
  screen. The text was read during this pass.
- [Architect facade story](https://www.machado-silvetti.com/nyu-global-center-for-academic-and-spiritual-life-story)
  was researched by the integration agent: ochre quartzite, twelve panel types
  across four opening densities and a stand-off from the curtain wall inform
  the implementation brief.
- [Front facade consultant](https://front.global/project/new-york-university-global-center-for-academic-and-spiritual-life/)
  describes the transition from a solid base to foliage over windows and wall.
  This page's text was also read. It calls the material limestone, differing
  from the architect's quartzite description; the model follows the architect's
  material description without asserting a physical material specification.

**No Global Center exterior photographs were visually inspected.** Image/browser
inspection was denied and shell retrieval unavailable in the parent research
pass. Existing Kimmel references predate this facade and were not treated as
evidence of its appearance. Photo comparison and browser acceptance remain
pending. This is an architect-text-informed approximation, not a faithful
transcription of the actual facade pattern, surveyed dimensions or interior.

## Implemented geometry

The model retains the decoded CityGML massing and its setbacks. Warm ochre and
pale stone materials are compatible with Kimmel. Exposed source faces become
the backing glazing behind separate perforated screen panels, with mullions,
ground-level glazing, a simplified park-facing doorway and roof-edge caps.
The party wall toward Kimmel stays solid. The base extends down to the map's
ground at Y=-0.12; original upper massing is not rescaled or shifted.

The screen uses three deterministic variations in four height bands, from
solid lower panels to more open upper panels. Actual polygon holes reveal the
glazing; small angular leaf shapes provide a lightweight abstract foliage
effect. These shapes, their spacing, color, doorway dimensions and density
thresholds are design approximations. They do not reproduce the architect's
twelve original panel drawings or claim its exact opening percentages. Source
height is retained because verified replacement dimensions were unavailable.

Six merged material meshes contain 12,718 triangles, including 680 panels,
1,079 leaf apertures and 146 vertical mullions. All geometry belongs to the
same identity root for selection, highlight, bounds and focus.

## Source and replacement contract

- Tile: `tile--1_0.glb`; runtime footprint index: **11021**.
- Decoded source bounds: `[-97.00797,1.24079,70.53788]` to
  `[-48.83117,32.06127,135.87639]` in Washington Square map meters.
- Exact footprint is recorded in `globalCenterReplacement.footprint`.
- No recentering, scale or placement transform should be applied.

```js
import {
  createGlobalCenterModel, removeGlobalCenterGeometry, globalCenterReplacement,
} from './global-center.js';
const globalCenter = createGlobalCenterModel(tileRoot);
const removed = removeGlobalCenterGeometry(tileRoot); // must equal 88
registerLandmark('nyu-global-center', globalCenter);
scene.add(globalCenter);
```

Create before removing this building. This can run before or after the separate
Kimmel replacement. The module's exact predicate requires footprint membership
of every vertex and centroid, Y within [1.14,32.17], outward-normal ownership
on shared boundaries, and exclusion of near-horizontal projected areas below
0.1 m². A broad polygon-only mask would incorrectly include ten degenerate
neighbor strips after Kimmel removal. Do not replace this removal function with
the generic building-removal helper.

## Checks actually run

`node --check src/global-center.js` passed. An inline NodeIO/Meshopt/Three.js
assertion script decoded the original tile and verified:

- Model creation leaves source triangle signatures unchanged.
- Global Center removes exactly 88 triangles; Kimmel still extracts/removes 200.
- Both removal orders retain the identical 2,310 triangles from the original
  2,598, and every retained triangle is an unchanged source triangle.
- Model positions/normals are finite, root position is zero and scale is one.
- Six meshes and 12,718 triangles; model bounds are approximately
  `[-97.3397,-0.12,70.2057]` to `[-48.6083,32.1613,136.2121]`.

Results are in `evidence/m8-gcasl/reference-source-check.json`.
Original source GLBs were not modified. No server or browser was launched in
this pass. Numerical checks do not establish visual or photographic fidelity;
integration, independent tests and eventual visual comparison remain separate.
