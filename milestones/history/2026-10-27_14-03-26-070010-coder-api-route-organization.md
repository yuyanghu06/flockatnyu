# Provider-grouped API handlers implemented

- Local timestamp / acting role: 2026-10-27_14-03-26-070010 / coder.
- Implemented: existing handlers now live under src/api/{flock,discord,google,treg,shared}; server/app.js composes authentication/services and registers routes. Routes, validation, source/version/receipt checks and abort behavior preserved. Dormant Treg lookup handlers stay unmounted.
- Packaging/build: only reachable src/api server modules may enter web runtime; browser source is denied. Website Docker includes and syntax-checks src/api.
- Coder checks: API build and ESLint pass; 121 affected HTTP/chat/map/Gmail/Contacts checks pass; nine planner/package checks pass including negative browser import rejection. Root separately prepared five source-only release archives successfully.
- Root retained the two existing test files original formatting plus updated imports to avoid an unnecessary oversized test rewrite. New source modules stay below 500 lines. Independent review underway; no deployment or live calls.
