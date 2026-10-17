# Park and garden rendering

The offline OSM snapshot supplies actual polygon rings, holes and mapped land
cover. `src/parks.js` clips them to the loaded extent, unions matching surfaces,
subtracts building and pedestrian footprints, and layers lawn, garden, hardscape,
play areas and water at distinct heights. Narrow boundary edging gives readable
close-up outlines. Existing trees, Gould Plaza, Courant garden and fountain remain.

Washington Square Fountain way959929617 is excluded from generated water, and its
bowl footprint is cut out of park surfaces to preserve the original fountain model.
Road/path widths and surface appearance are stylized; this is not surveyed terrain.

Run `node scripts/build-streets-parks.mjs` after data or renderer edits. This bakes
streets and parks to one GLB plus small metadata JSON; the app loads those assets
without doing polygon Boolean operations at startup. Source snapshot attribution
and geographic calibration are in streets-parks-data.md. Parks includes mapped
internal land-cover parts, not just named public parks; access is not inferred.
