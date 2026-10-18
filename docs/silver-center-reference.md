# Silver Center: identity, visual reference and runtime contract

The requested building is **Silver Center for Arts and Science**, 100 Washington
Square East, beside Washington Square Park. It is distinct from Silver Towers
and the Silver School of Social Work. NYU's [official location page](https://meet.nyu.edu/locations/silver-center/)
identifies the academic building and its connections to Brown and Waverly; those
neighboring buildings remain outside this replacement.

## Photos actually inspected

- `reference-silver-center-official.jpg`: [NYU entrance photo](https://meet.nyu.edu/wp-content/uploads/2020/06/FeatureImage.jpg),
  opened with `view_image`. It shows pale masonry, gold-colored door frames,
  glazed entrance bays and dark sash windows. This is an entrance close-up,
  not evidence for the entire facade.
- `reference-silver-center-full.jpg`: a [second NYU article's image](https://meet.nyu.edu/wp-content/uploads/2022/09/FeatureImage.jpg)
  was downloaded under this research filename but proved to be the same entrance
  close-up when opened. The filename does not establish full-building evidence.
- `reference-silver-center-feis.png`: **NYC Planning NYU Core FEIS Chapter 7,
  PDF page 21, Figure 7-6, View 12**, rendered at 2200 pixels with `pdftoppm` and
  actually opened. The right-hand photograph, captioned Hemmerdinger Hall,
  100 Washington Square East, supplies the full west facade. View 11 is Brown
  Building and was not used as the Silver Center reference.
  [Official PDF](https://www.nyc.gov/assets/planning/download/pdf/applicants/env-review/nyu_core/07_feis.pdf).

The full-building photo shows pale stone/brick, repeated paired rectangular
windows, an upper section with more prominent vertical piers, elaborate belt
courses and a green cornice. The accompanying historic-resource description
(PDF pages 33–34) identifies the 1895 Alfred Zucker building and distinguishes
its lower seven floors from the upper three. The model translates these
features into restrained geometry, rather than copying photographic textures.
References retain NYU/NYC publication and photographer credits; research copies
are not bundled app assets or a new assertion of redistribution rights.

## Correct footprint and preserved geometry

[OpenStreetMap way 248166211](https://www.openstreetmap.org/way/248166211)
identifies Silver Center, address 100 Washington Square East and NYC BIN1008820.
The official OSM API map response is stored in
`reference-silver-center-osm.xml`. Its plan coordinates were compared with the
exported data through the Washington Square Arch's known OSM/map correspondence.
The Silver outline closely matches runtime footprint **11667**, generally within
roughly half a meter; the connected Brown and Waverly outlines are distinct.

Source tile: `assets/yuyang-site-3d-assets/models/buildings/city-tiles/tile-0_0.glb`.
The exact authoritative plan polygon is exported as `silverCenterReplacement`
from `src/silver-center.js`. NodeIO/Meshopt decoding extracted **380 triangles**
within that footprint. Original ground and highest roof elevations are
**1.304127** and **58.228254 meters**. Multiple roof levels around44.2–55.7meters,
including curved rooftop source geometry, are retained without reshaping.
`reference-silver-center-source.json` records the independent extraction.

## Integration

Call `createSilverCenterModel(tileRoot)` on loaded **tile-0_0.glb before removing
the source triangles**. It returns a fresh Group in baked Washington Square map
coordinates with identity transform and stable building ID `nyu-silver-center`.
Then call `removeReplacedBuilding(tileRoot, silverCenterReplacement)`; expect
**380 removed triangles**. Register the whole returned Group through the existing
selection/highlight path. Apply no additional placement transform. The builder
does not mutate the input source arrays. Original GLB/metadata files stay intact.

The current implementation merges all details into seven material meshes,
**73,892 triangles**, and857 window modules. Bounds including shallow facade
relief are approximately `[116.2742,1.3041,19.2166]` to
`[177.3723,58.2283,87.2918]`. Checks are recorded in
`reference-silver-center-check.json`; syntax and Node instantiation passed,
source arrays were unchanged and the removal helper removed380 triangles.

## Approximation limits

Source massing and roofs are preserved; windows, paired-bay spacing, pilaster
dimensions, dentils, cornice profile, rustication and door placement are inferred
from the photos for map-scale legibility. Ground and upper details are shallow
opaque overlays on the original shell, not cut-through openings. Window count
is a model metric, not an architectural inventory. Street elevations receive
more ornament; service faces receive simpler windows. Rooftop mechanical forms
above the occupied facade receive no invented classroom windows. No literal
lettering, sculpture, interiors or physical glass reflections are claimed.
Browser appearance, surrounding alignment and complete-building interaction
still require independent testing before acceptance.
