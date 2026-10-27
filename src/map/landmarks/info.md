# Landmark geometry and effects

Building-named modules construct or enhance campus models. `geometry.js` removes
only explicitly replaced source triangles and validates camera/pan values.
`landmark-effects.js`, `landmark-footprint.js` and `landmark-outline.js` own the
hover/selection treatment. `map-resources.js` shares and freezes static resources.

All selectable details remain under their building root. Preserve source-derived
bounds, neighboring source triangles, merged selection, materials and resource
ownership. Applied source placements live in `../data` and original asset JSON.
