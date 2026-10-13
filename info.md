# Project root guide

This Git checkout is the project root. Application source belongs in `src/`, with
`index.html` at the root. Vite scripts in `package.json` provide `npm run dev`,
`npm run build`, and `npm run preview`. The user resumed implementation on
2026-10-10; earlier cancelled-session notes are historical.

`AGENTS.md` records product scope and development rules. `README.md` is the entry
point. `.codex/` contains project-local development-agent configuration.
`docs/` explains collaboration and contains assignment/report templates.
`milestones/` tracks current state, unfinished work, and immutable pass history.

`yuyang-site-3d-assets/` is the preliminary export from the personal site, with its
own README and manifest. `campus-assets/` contains the extracted Paulson model
and its placement metadata. `tools/` contains extraction and journal utilities.
Preserve source geometry and metadata. `.gitignore` excludes dependencies, build
output, local secrets, and redundant archives. `tests/` and `evidence/` hold
browser acceptance checks and captured results as implementation proceeds.

M16 extends the existing website: admin.html is a standalone channel settings entry; server/ owns Hono and a separate daily Discord REST worker, supabase/ holds local migrations, docs/discord-archive.md describes the future separate cron service; the API-only legacy railway.json is not reused for it. Runtime keys stay in ignored environment files. The archive is locally tested, with live launch pending; see docs/discord-archive.md.

`deployment/discord-worker/` provides an isolated backend-only Docker input for the dedicated Railway archive service. `docs/discord-launch.md` describes bot setup and local-to-Railway handoff; current verification and remaining inputs are in milestones/.

M21 supersedes the removed M20 loading design: index.html/map-startup.js open
the prepared map automatically, with a small status/retry notice only. WASD pans
the map; Bobst/Silver focus20%farther back; Gould Plaza is grouped under Stern.
See docs/loading-screen.md, docs/camera-navigation.md and evidence/m21-map-input/.
