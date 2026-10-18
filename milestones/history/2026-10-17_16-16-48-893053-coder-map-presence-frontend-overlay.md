# Map presence frontend overlay

- Local timestamp / acting role / milestone: 2026-10-17T16:16:48.893053-04:00; coder; map-presence-ui.
- Requested scope: Find My-style avatar markers above existing building geometry, without restyling the map.
- Starting state: protected API and hosted fixture ready; unrelated source/branding changes preserved.
- Work performed: frontend coder added src/map-presence.js/.css; minimal main.js import/init/frame/disposal/debug hooks; updated src/info.md. Circular portraits/initials, Test badges, true roof anchor/tethers, person details, building selection/focus,30second refresh and foreground updates, expiry/error cleanup.
- Decisions: Vite maps known local portrait paths to emitted assets; no hardcoded roster fallback, remote image trust or browser secrets. Cache root-local roof bounds once; project after camera navigation. Parent overlay ignores map pointer input except accessible buttons.
- Checks and evidence: frontend build, node syntax and scoped whitespace PASS. Existing chunk-size warning retained. Independent browser checks pending at this pass.
- Resulting state / acceptance: implemented locally; no map geometry/palette/lighting or camera changes.
- Remaining work and handoff: edge/accessibility refinement, independent browser and evaluator acceptance.
