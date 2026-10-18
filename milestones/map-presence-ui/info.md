# Map presence avatar UI

Goal complete locally: five temporary Bobst occupants display as database-backed circular portrait buttons with cached roof anchors and camera-aligned tethers. Map geometry, palette, lighting and camera profiles are unchanged.

Modules: server/map/presence.js and protected GET /api/map/presence; src/map-presence.js/.css and minimal main-loop hooks; scripts/map-debug-presence.mjs for conditional24-hour fixture apply/clear. See docs/map-presence.md for commands and contracts.

Verified:13API tests,20assistant regressions,12synthetic production-browser checks, separate latest-build live5portrait/HTTP200 check, frontend/API builds and independent evaluator ACCEPT. Desktop/mobile240/250/390px, edge/orbit/hover-lift/focus/expiry/error behavior covered. Browser evidence uses software Chrome/emulated devices, not physical-device performance measurements.

Working local server4187/API3127 retained (session70408); older5173/3001 preserved and needs API restart for the new route. Debug entries expire2026-10-18T20:13:44.113Z. No migrations or deployment. Normal source entries remain default-deny pending current-policy callback; production member auth and agent map writes remain separate.
