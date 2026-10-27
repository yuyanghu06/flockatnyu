# Fixed campus data and asset URLs

`config.js` imports authoritative placement/extraction JSON and defines the
palette, fixed building catalogue and camera limits. `building-views.js` keeps
per-building focus poses. `assets.js` lists landmark/environment models and
combines the explicit city-tile URL lists in `tiles-1.js` and `tiles-2.js`.

Explicit URLs keep the production map area bounded. When moving code, resolve
URLs against the new module location without changing the model list, order,
coordinates or catalogue identities.
