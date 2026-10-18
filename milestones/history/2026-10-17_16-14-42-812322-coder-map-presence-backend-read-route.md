# Map presence backend read route

- Local timestamp / acting role / milestone: 2026-10-17T16:14:42.812322-04:00; coder; map-presence-ui.
- Requested scope: service-only authenticated map presence read API for frontend markers.
- Starting state: no map route; applied tables unchanged.
- Work performed: backend coder added server/map/presence.js and integrated server/app.js/index.js; updated owned map guide.
- Decisions: bounded fixed-origin Supabase reads; exact local GET auth exemption; minimal identity/portrait/status/time DTO; no Discord IDs/email/provenance returned. Exact planned Bobst debug entries only visible to nonproduction local principal. Ordinary sources require allowlist plus positive current-policy callback; index currently omits callback and fails closed.
- Checks and evidence: node syntax checks for3JS files, API build and scoped whitespace PASS. No cloud calls/writes performed by coder.
- Resulting state / acceptance: backend ready for independent test; UI pending.
- Remaining work and handoff: tester verifies auth, filtering, failures, privacy and live fixture; no production member auth or deployment added.
