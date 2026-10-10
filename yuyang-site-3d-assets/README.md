# Yuyang site 3D map assets

Copied and exported from the local YuyangSite/backend repository.

- models/buildings/city-tiles/: 484 original building-only GLBs and their manifest (17,373 buildings across the full source dataset).
- models/buildings/: original Bobst Library and Washington Square Arch, plus five baked landmarks with their facades and rooftop details.
- models/environment/: Hudson and East River water, piers and waterfront trees, park trees and grass, fountain, Gould Plaza and Courant garden.
- data/: building runtime geometry, road-free shoreline data and original model placement instructions.
- asset-manifest.json: provenance, included models, exclusions and import notes.

Generated models and city tiles retain the site's Washington Square origin and Y-up coordinates. Load them at identity. Bobst and the arch are original local-space models: apply data/landmark-placements.json to reproduce site placement. Tile colors are vertex colors; use a white vertex-color material with roughness 1. Tiles use EXT_meshopt_compression and require a Meshopt decoder.

Roads, FDR Drive, pier access lanes, crosswalks, park paths and traffic are excluded. Fountain geometry is a static snapshot; its runtime water animation is not included. Original GLB metadata is preserved. OpenStreetMap-derived geometry attribution: https://www.openstreetmap.org/copyright . Preserve applicable original model licenses when reusing or publishing.
