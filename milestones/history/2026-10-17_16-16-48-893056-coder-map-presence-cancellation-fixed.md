# Map presence cancellation fixed

- Local timestamp / acting role / milestone: 2026-10-17T16:16:48.893056-04:00; coder; map-presence-ui.
- Requested scope: fix pre-aborted request unhandled rejection.
- Starting state: tester found orphan cancellation promise rejection.
- Work performed: backend coder changed only server/map/presence.js; pre-aborted signals reject before cancellation-promise allocation, and adapter execution is deferred until race handlers attach.
- Checks and evidence: node --test tests/map-presence.test.mjs12/12PASS exit0, syntax and scoped whitespace PASS; no cloud operations.
- Resulting state / acceptance: coder fix complete; independent rerun/evaluation required.
- Remaining work and handoff: tester/reviewer confirm no stray rejection; integrate final UI evidence.
