# Leslie eLab host building: visual reference and source contract

The lab occupies street level at **16 Washington Place**, at Greene Street.
The modeled object is the complete host building, **12–16 Washington Place /
240–242 Greene Street**, commonly addressed as **14 Washington Place**. It is
not a separate lab-sized box.

## Identity and visual evidence

- [NYU's lab announcement](https://entrepreneur.nyu.edu/blog/2014/02/28/leslie-elab/)
  establishes the lab's street-level address and corner location.
- [NYU's official lab page](https://entrepreneur.nyu.edu/resource/leslie-elab/)
  provides the [storefront photograph](https://entrepreneur.nyu.edu/app/uploads/2015/09/Leslie-eLab-Sep21-copy.png).
  Downloaded as `reference-leslie-official.png` and visually opened. It shows
  cream masonry piers, black metal storefront frames, buff brick above, dark
  multi-pane upper windows, projecting window air conditioners and a purple banner.
- [NYC Planning's NYU Core FEIS, Chapter 7](https://www.nyc.gov/assets/planning/download/pdf/applicants/env-review/nyu_core/07_feis.pdf),
  PDF page47, Figure7-15, **View B** (bottom right), supplies the full-building
  photograph. Its caption explicitly equates the address variants. The document
  identifies a 13-story, 1930 Art Deco-influenced apartment building. Visually,
  light brick piers, recessed darker window/spandrel strips, pale trim and upper
  setbacks distinguish it from the nearby loft buildings. This 2011 photograph
  is used for the enduring architecture, not the pre-eLab ground-floor signage.
- [OpenStreetMap way248166305](https://www.openstreetmap.org/way/248166305)
  identifies the host polygon and NYC BIN1008812. Its node geometry was downloaded
  from the official OSM API to `reference-leslie-osm.xml`.

The full NYC PDF and rendered page are saved as
`reference-leslie-nyc-feis.pdf` and `reference-leslie-nyc-full-building.png` under
`evidence/m3-campus-details/`. Rendering used the PDF skill and `pdftoppm`, then
`view_image` for actual visual inspection. The image at the **top** of that page
is a different building, 82 Washington Square East, and was not used as the model.
Reference photos are research evidence only; no image textures are shipped.
Photographs retain NYU/NYC document credits; no new redistribution license is claimed.

## Source footprint and exact geometry preservation

The matching exported runtime footprint is index **11174**, in **tile-0_0.glb**.
The OSM ring was compared against map coordinates using the Washington Square Arch's
known OSM nodes and authoritative recorded placement footprint. Corresponding
segments align within roughly0.5–2 meters, consistent with different source
surveys/rounding; neighboring street geometry and the corner position agree.

The builder preserves the CityGML source rather than substituting OSM's simpler
footprint or its single43.4m height. The source has **164 triangles**, including
stepped roofs around31.65,36.55–37.33,43.63 and47.60m, plus a rooftop structure
reaching59.4203m. The main43.63m elevation is consistent with the roughly143-foot
building documented in the FEIS. The upper source structure is retained without
inventing windows or claiming that its particular CityGML shape is photo-verified.
Ground Y=-0.09082m remains just above the map plane at-0.12m.

The exact polygon and replacement height range `[-0.091,59.421]` are exported from
`src/map/landmarks/leslie-elab.js` as `leslieElabReplacement`. The independent NodeIO source
extraction is saved as `reference-leslie-source-triangles.json`.

## Integration contract

Call `createLeslieElabModel(tileRoot)` on loaded **tile-0_0.glb before removing
the host triangles**. The function reads source positions with complete world
transforms and builds fresh geometry; it never changes the input geometry.
It returns an identity-root Group with all positions baked into Washington Square
map meters, stable ID `nyu-leslie-elab-building`. Apply no extra placement.

After extraction, call the existing `removeReplacedBuilding(tileRoot,
leslieElabReplacement)`; expect164 removed triangles. Register all seven material
meshes under the single building root using the existing highlight/selection path.
Windows, storefront, trim and banner are all merged, not individual scene objects.

## Checks and limitations

Actual Node instantiation yielded seven material meshes,31,772 triangles,
498 modeled window modules and16 storefront modules. Bounds were approximately
`[157.2737,-0.09082,129.4880]` to `[200.8498,59.4203,166.8062]`; facade relief
extends a few tenths of a meter beyond the unchanged source walls. Source arrays
were checked unchanged after building. `node --check src/map/landmarks/leslie-elab.js` passed.

Wall planes and roofs come directly from the source mesh. Window spacing,
individual pane count, air-conditioner placement and storefront module sizes
are photo-informed approximations, not measured facade drawings. Unobserved
service elevations receive simpler fenestration; rooftop source blocks receive
no invented residential windows. Browser evidence for appearance, neighboring
alignment, duplicate removal and whole-building selection is required before
integration acceptance and is owned by the tester.


Final review correction: the shallow occupied setback from 43.63 to 47.60 m receives its own fitted window row. Mechanical volumes above 48 m remain unfenestrated.
