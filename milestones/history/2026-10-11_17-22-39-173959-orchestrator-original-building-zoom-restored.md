# Original building focus zoom restored

- Local timestamp / acting role / milestone: 2026-10-11T17:22:39.173959-04:00 / orchestrator / M19 follow-up.
- Requested scope: user requested direct work without subagents; zoom the new cameras back to their original zoom distances.
- Starting state: eight lowered-angle profiles, shortened radial distance and a 94.36 m Stern close-distance override.
- Work performed / changed files: camera-focus.js again uses the original full-building bounding-sphere/FOV fit distance. Removed radial shortening and Stern's distance override in building-views.js. Kept configured view angles, Stern target and screen-wide outward return. Updated existing browser distance assertions, camera guide and source guide.
- Checks / evidence: direct camera numerical suite 20/20, production Chrome 23/23 on desktop/portrait with original distance assertions, build and diff check passed. Browser load 3351 ms, no errors or failed requests. Evidence: evidence/m19-building-views/restored-zoom/. These checks were performed by the primary agent; no independent specialists ran this follow-up.
- Acceptance: original focus zoom restored for all profiles; new orientations retained. Prior close-distance behavior is superseded by this user correction.
- Remaining work / handoff: user additionally requested large moving loading gears based on the Tech NYU reference. That work is now active, with current source/layout inspection in progress.
