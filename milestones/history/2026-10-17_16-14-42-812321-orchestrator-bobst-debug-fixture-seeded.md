# Bobst debug fixture seeded

- Local timestamp / acting role / milestone: 2026-10-17T16:14:42.812321-04:00; orchestrator; map-presence-ui.
- Requested scope: populate five people at Bobst for UI debugging.
- Starting state: nine empty building presence arrays,26linked people.
- Work performed: added scripts/map-debug-presence.mjs; hosted seed then cleanup/reseed roundtrip verified five planned debug entries at Bobst, expiring after24hours. Identity fields and other buildings preserved. No private roster copied into evidence.
- Decisions: fixed unmistakable debug provenance; planned status never claims a real self-report. Single conditional table patch matches full previous array and updated_at to prevent concurrent overwrite, preserving other occupants; explicit clear removes only exact fixture provenance.
- Checks and evidence: live apply/clear/reapply succeeded; final fresh RPC read returns five exact active fixtures. Reusable commands documented after implementation.
- Resulting state / acceptance: hosted fixture ready; UI integration pending; no schema, deployment or agent activation changes.
- Remaining work and handoff: independent API/browser tests and integration review.
