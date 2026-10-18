# Disable overview avatar hover

- Local timestamp / acting role / milestone: 2026-10-17T16:48:12.736851-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: no user hover state in the initial map view; primary implements, user tests.
- Starting repository state: previous avatar redesign present in an existing dirty tree.
- Work performed / changed files: src/map-presence.js now gates pointer hover details on the matching focused building; src/main.js provides cameraNavigation.focusedId; CSS removes the hover selector; source/current map guides updated.
- Decisions: clicking still selects/focuses; keyboard focus remains accessible. Unpinned pointer details close when leaving building focus.
- Checks and evidence: node --check on both edited JavaScript modules and npm run build PASS; existing chunk warning only. No browser tests or specialists per user direction.
- Resulting state / acceptance: implemented locally, user visual testing pending; no API/data/deployment changes.
- Remaining work and handoff: user-directed next visual change.
