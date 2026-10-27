# Silver Towers / University Village reference and model contract

This campus model treats the three-tower University Village ensemble as one
selectable location, `nyu-silver-towers`. The display name is **Silver Towers /
University Village**. The complex includes NYU's 100 and 110 Bleecker Street
faculty residences and the 505 LaGuardia Place cooperative; the third tower is
not presented as an NYU-owned faculty residence. Source identity is the NYC
[LPC designation report, LP-2300](https://www.nyc.gov/html/mancb2/downloads/pdf/nyu_2031_plan_docs/university_village.pdf),
pages 1–3, read on 2026-10-10.

## Actual visual references

The restoration architect's [Silver Towers project](https://www.ctaarchitects.com/silver-towers)
documents its window/PTAC replacement work at 100 and 110 Bleecker Street.
Both linked photographs were downloaded and actually opened with `view_image`
before modeling, not inferred from captions:

- `evidence/m3-campus-details/reference-silver-overall.jpg` —
  [CTA exterior image DSC_0115](https://images.squarespace-cdn.com/content/v1/64c0194fdc1c785b00cdf15a/a618919c-8033-4e2a-b899-986fb1b93acd/DSC_0115.JPG).
- `evidence/m3-campus-details/reference-silver-facade.jpg` —
  [CTA exterior image DSC_0123](https://images.squarespace-cdn.com/content/v1/64c0194fdc1c785b00cdf15a/c884ff91-87c8-4f8a-9b4c-f0982762505e/DSC_0123.JPG).

The photos show warm buff concrete, repetitive recessed dark window bays,
prominent horizontal beams, narrow vertical columns, and broad blank concrete
returns. The model follows that restrained palette, retaining small glass-tone
variation rather than colorful panels. The LPC report describes 30-story towers,
four- and eight-bay elevations, and the offset pinwheel arrangement. These
features inform the facade treatment. Photo credit remains with CTA/the original
photographer; the downloaded files are research evidence, not app textures.

## Preserved measured geometry

The original CityGML geometry is decoded using glTF-Transform with Meshopt.
Source: `assets/yuyang-site-3d-assets/models/buildings/city-tiles/tile--1_2.glb`.
Authoritative plan polygons come from the correspondingly indexed footprints in
`assets/yuyang-site-3d-assets/data/building-runtime.json`.

| Footprint index | Original triangles | Ground Y | Highest source Y |
| --- | ---: | ---: | ---: |
| 11190 | 76 | 2.88306 | 91.69161 |
| 11189 | 72 | 2.63194 | 91.62066 |
| 11195 | 80 | 2.95401 | 94.82761 |

Extraction retains triangles whose three world-space vertices lie within the
recorded polygon, with the existing 0.08-meter boundary tolerance. The 228
triangles, rounded to five decimal meters, are embedded in `src/map/landmarks/silver-towers.js`.
This preserves the stepped footprints and actual source roof/penthouse geometry,
including the source dataset's slightly different tower heights. The originals
are unchanged. The broader roof datum near Y85 meters anchors the facade's top;
the taller recorded roof volumes remain visible above it.

## Runtime contract and approximation

`createSilverTowersModel()` returns one identity-transform Group with vertices
already in Washington Square map meters. Its five merged material meshes contain
the shells, concrete frames, glazing, metal strips, reveals and ground supports.
The final local check measured 111,108 triangles. Bounds are approximately
`[-158.77202, 2.63194, 387.11899]` to `[-34.74935, 94.82761, 473.96872]`.

`silverTowerReplacements` exports the exact source polygon, tile, footprint index
and height range for each tower. Remove their 228 original triangles from the
loaded tile with `removeReplacedBuilding` before adding this detailed Group.
Assign the whole Group the stable ID; apply selection/highlight to every mesh.
No placement transform or scaling should be applied a second time.

This is a photo-informed facade approximation, not an as-built reconstruction.
The four long elevations receive four/eight window bays; narrow returns remain
blank shear walls. Collinear source polygon vertices are merged only for facade
layout, not for the preserved shell. Twenty-nine upper window rows and a distinct
ground level suggest the 30-story composition. Frame projection (0.7 meters),
window pitch, sill/PTAC dimensions, mullions, tapered ground supports and entrance
positions are inferred. Glass sits forward of the opaque original shell and
behind projecting concrete frames; there are no cut-through interior openings,
photo textures or physical reflections. No landscaping, roads or sculpture is
invented in this module. Ground facade relief extends less than a meter beyond
the original polygon. Browser appearance, selection and performance require the
independent integration tester's evidence.

Superseded in M4: the user clarified Silver Center was intended. The custom Silver Towers module is no longer imported or rendered, and its source-tile triangles are no longer removed. Ordinary city context remains. This reference document preserves the prior pass history.
