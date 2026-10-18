# Derived map data

`extracted-buildings.json` records Paulson extraction provenance, placement and the
exact Coles replacement boundary. `streets-parks.json` is the attributed offline OSM
snapshot. `streets-parks-render.json` describes the baked environment;
`park-vegetation-render.json` records deterministic planting, exclusions and source
hashes. Runtime imports and developer scripts use paths beneath root `assets/`.

Preserve original source paths, coordinates and attribution. When a recorded local
input path changes, update its path field and any hash affected by a metadata change;
do not regenerate geometry solely to relocate these files.
