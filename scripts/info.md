# Development scripts

`extract-paulson-center.mjs` reproduces the previously extracted building from the
original source scene (not included in this checkout). It preserves the source.
`journal-pass.ps1` appends timestamped development records on Windows; shared
journal writes belong to the orchestrator.

M6: fetch-streets-parks.py retrieves attributed OSM geometry (--reuse regenerates from cached raw evidence); build-streets-parks.mjs generates the runtime GLB and metadata. inspect-park-bounds.mjs checks existing scenery datums.

M10: build-park-vegetation.mjs bakes deterministic trees/shrubs inside mapped parks and explicit vegetation cover, using actual runtime geometry exclusions. Writes identity GLB, placement audit and coder evidence.

M12: profile-map-memory.mjs assembles the complete scene offline for retained resource comparison.

- check-api.mjs validates backend syntax/imports using the installed API dependencies.

`prepare-discord-deploy.mjs` and `prepare-gmail-deploy.mjs` create fresh temporary Docker contexts from each collector entrypoint’s transitive static ES module imports. The shared helper in the Discord preparer uses Node’s parser without executing source, rejects reachable symlinks/dynamic loaders/path escapes/unreviewed packages, and copies only service modules plus independent pinned manifests/locks and root Docker/Railway config. Exact-file Docker ignore rules protect the context. Deploy the printed directory, never the checkout. Discord uses only its transport SDK; Gmail uses only Hono and Google auth. Neither packages agent/model/map/other-connector code. Local preparation requires Node 22.12 or later.

The M20 decorative loading-gear authoring tool was removed when the user cancelled that UI in M21; its historical reference/evidence remains under evidence/m20-loading-gears/.

M24: dev.mjs supervises the local API and Vite, waits for identified API health, honors PORT, forwards frontend arguments and cleans only its own children. npm run dev uses it; dev:web and dev:api support separate sessions. Paired mode requires an unused API port and restart after backend edits.

M26: google-connect.mjs performs one-time club-account OAuth consent using a fixed loopback callback, state and PKCE, writing ignored0600 .env.google only. Runtime tokens belong in Railway secrets after consent. No Gmail/Drive content is accessed during setup until the account is authorized.


prepare-miro-deploy.mjs builds a fresh, symlink-rejecting allowlisted Miro-only deployment directory with no secrets or unrelated modules.

Callable assistant tools live in ../tools/; these scripts are developer utilities and are not registered with the model.
