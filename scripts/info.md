# Development scripts

`extract-paulson-center.mjs` reproduces the previously extracted building from the
original source scene (not included in this checkout). It preserves the source.
`journal-pass.ps1` appends timestamped development records on Windows; shared
journal writes belong to the orchestrator.

Map utilities read source exports from `assets/yuyang-site-3d-assets/` and read/write
project-derived data and models under `assets/campus-assets/`, relative to the
repository root. Keep exported source geometry and original provenance intact.

M6: fetch-streets-parks.py retrieves attributed OSM geometry (--reuse regenerates from cached raw evidence); build-streets-parks.mjs generates the runtime GLB and metadata. inspect-park-bounds.mjs checks existing scenery datums.

M10: build-park-vegetation.mjs bakes deterministic trees/shrubs inside mapped parks and explicit vegetation cover, using actual runtime geometry exclusions. Writes identity GLB, placement audit and coder evidence.

M12: profile-map-memory.mjs assembles the complete scene offline for retained resource comparison.

- check-api.mjs validates backend syntax/imports using the installed API dependencies.

`prepare-discord-deploy.mjs` and `prepare-gmail-deploy.mjs` create fresh temporary Docker contexts from each collector entrypoint’s transitive static ES module imports. The shared helper in the Discord preparer uses Node’s parser without executing source, rejects reachable symlinks/dynamic loaders/path escapes/unreviewed packages, and copies only service modules plus independent pinned manifests/locks and root Docker/Railway config. Exact-file Docker ignore rules protect the context. Deploy the printed directory, never the checkout. Discord uses only its transport SDK; Gmail uses only Hono and Google auth. Neither packages agent/model/map/other-connector code. Local preparation requires Node 22.12 or later.

The M20 decorative loading-gear authoring tool was removed when the user cancelled that UI in M21; its historical reference/evidence remains under evidence/m20-loading-gears/.

M24: dev.mjs supervises the local API and Vite, waits for identified API health, honors PORT, forwards frontend arguments and cleans only its own children. npm run dev uses it; dev:web and dev:api support separate sessions. Paired mode requires an unused API port and restart after backend edits.

M26: google-connect.mjs performs one-time club-account OAuth consent using a fixed loopback callback, state and PKCE, writing ignored0600 .env.google only. Runtime tokens belong in Railway secrets after consent. No Gmail/Drive content is accessed during setup until the account is authorized.


The former Miro snapshot deployment preparer is retired; miro-connect.mjs sets up app-owned live MCP OAuth.

Callable assistant tools live in ../tools/; these scripts are developer utilities and are not registered with the model.

Google consent supports `npm run google:connect -- --force --calendar` to add Calendar event and calendar-list permissions to the existing authorized account. Default consent remains Gmail/Drive read-only. The loopback verifies the complete requested scope set before atomically replacing the ignored0600 credentials file; it never enables workers.

`build-brand-loader.mjs` converts the approved flat v4 @ raster silhouette into two native SVGs under assets/branding/: a richer static mark and a seamless clipped color/sheen loader. Re-authoring requires local ImageMagick and Potrace; runtime does not. Prior raster designs and source geometry stay untouched.

`map-roster.mjs` reads the26avatar-backed rows and searches only configured tech@nyu guild member-name prefixes through the existing bot. `npm run map:roster` proposes name matches; `npm run map:roster -- --apply` conditionally writes unique matches. Ambiguous/initial/prefix-only/incomplete results stay pending, and existing IDs/manual names are preserved. Optional candidate outputs use new mode0600 files under /tmp, never committed directory archives.

The current brand loader samples two centerline routes by arc length and phases their stroke colors to circulate along the @; its output retains the approved silhouette and unchanged static fallback. No per-frame JavaScript runs in the website.

`map-debug-presence.mjs` explicitly applies or clears five temporary Bobst UI fixtures using the configured Tech NYU project. Run `node --env-file-if-exists=.env scripts/map-debug-presence.mjs --apply` to seed/refresh24-hour planned debug entries, or `--clear` to remove only that exact fixture. Conditional updates preserve other occupants and concurrent edits. These entries are never real location reports; the protected local map feed labels them Test. No schema or worker changes.

`build-brand-loader.mjs` also emits static outer/inner alpha-mask SVGs for compositor-only startup colors. `build-brand-loader-video.mjs` captures64native SVG frames at2048px and encodes a2.133333s MP4 export; runtime does not depend on it. `build-brand-favicon.mjs` freezes phase-zero contour colors and creates a rounded-square white SVG badge plus16/32/48px ICO with transparent corners, without a checked-in PNG.

The map fixture now stores label: Test explicitly inside each JSON entry. The UI displays only that stored label; source metadata is used for cleanup/authorization, never to invent display text. Existing fixture labels can be edited without changing source identity or expiry.

`build-brand-favicon.mjs` now centers a0.65scale mark within its existing white badge; source geometry/colors and16/32/48px ICO sizes remain. This sizing affects the site icon rather than startup artwork.

`build-brand-loader-v6.mjs` reproduces vector assets for the rejected periwinkle/highlight trial. Its archived HTML preview captures that trial’s former runtime styling; neither the v6 artwork nor that preview is used by current startup.

`build-brand-relief.mjs` derives a transparent static raised-edge/sheening overlay from the accepted v5 outline and captures a matching runtime-style loop-only preview. `build-brand-favicon.mjs` embeds those same relief filters with locally prefixed SVG IDs into its frozen mark, at scale 0.8 after the final 20% reduction. Generate relief before rebuilding favicon when authoring from scratch. No animated filters or runtime bitmap logo are introduced.

The 2026-10-18 normalized-events revision replaces the legacy map fixture script's building JSON edits. `map-debug-presence.mjs --apply` creates explicit24-hour personal_plan event/people/building relationships; `--clear` cancels only the exact fixture source pair. Optimistic event versions preserve concurrent edits and unrelated events. This supersedes the earlier JSON-array fixture instructions above. The script is an explicit developer utility, not an agent tool, and is not run by migration.

miro-connect.mjs performs app-owned Miro MCP OAuth consent with private refresh credentials. The old Miro REST snapshot deployment preparer is removed.

`verify-agent-prompts.mjs` is an explicit --live-model behavioral harness: it calls the configured provider using production prompts and controlled synthetic sources/inert write adapters. It must not enable the worker, mutate club events or print credentials.

The agent harness enforces exact synthetic provider selectors/window pagination and gently spaces actual model requests. Interrupted diagnostics and per-case hashes remain explicit; latestCases merges runs and must not be described as one all-case final-build run.

`prepare-runtime-deploy.mjs` produces secret-free temporary web/worker contexts with reachable reviewed modules, pinned pruned dependencies and exact Docker inclusion. It never uploads repository environment/auth files.
