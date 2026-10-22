# Go Greek popup manifest and removal guide implemented

- Role/scope: coder; display rename and reversible one-day popup packaging.
- Changed: new src/go-greek-popup.js; updated config.js, building-views.js and main.js conditional consumers; model debug name only; expanded docs/683-broadway-model.md.
- Behavior: display Go Greek while keeping stable ID 683-broadway. One enabled flag controls visual record, fixed camera, lazy model import, in-memory 70-face replacement and whole-landmark registration. Disabled leaves the original tile shell untouched. Geometry itself is unchanged.
- Guide: source-to-model-to-shared-UI import chain, no independent custom binary/image assets, one-flag disable/rebuild/reload, emitted-versus-requested chunk distinction and precise permanent cleanup inventory. Preserve shared exports/helpers/styles/cards/database/applied migrations and immutable history. No day supplied, so no automatic expiry.
- Checks: five Node syntax checks, manifest/camera assertions, scoped whitespace and frontend build pass (119 modules, 7.14 kB separate model chunk; existing main chunk warning).
- Limitations/next: independent on/off browser and catalogue tests pending. No deployment, database/source/provider or external writes. Orchestrator updates folder guides and final journal.
