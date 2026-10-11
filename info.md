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
