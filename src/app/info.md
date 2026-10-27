# Browser startup and composition

`bootstrap.js` paints the recoverable loading screen before importing `main.js`.
`map-startup.js`, `loading-state.js` and `startup-visual.js` manage that transition.
`main.js` connects selection, camera controls, the assistant, Contacts, presence
and model loading. The map's scene setup, model preparation, frame timing and
read-only developer snapshots live in `map-scene.js`, `map-models.js`,
`map-frame.js` and `map-diagnostics.js`.

Those modules share one `view` object for the running map. Install functions
first, initialize the scene in order, then load assets and expose diagnostics.
Do not change geometry, camera values or resource ownership during file cleanup.
`style.css` imports ordered base and overlay rules; keep their order intact.
