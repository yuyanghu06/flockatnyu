# Event kind projection and exact local preview policy implemented

- Role/scope: backend coder; server/map/presence.js and newserver/map/event-preview.js only.
- Implemented: safe event presentation carries actual kind. Exact Go Greek sample source/event IDs, title, building, type/status/timed interval bounded to two hours plus1ms qualify only for nonproduction local-development display. Reserved provenance on event or participant cannot fall through; row must be the event itself and participant permission is never granted. Existing Bobst and normal provider checks unchanged.
- IDs: source793e578c-b825-46df-a52f-ad762e0412dd; event63ebd0ce-1100-4d9b-bdfc-1d9d5d92c55f. URLexample.invalid/.../go-greek-active-event-v1; exact constants in GO_GREEK_EVENT_PREVIEW.
- Checks: both syntax checks pass;51existing presence/event-service/failure checks pass. Direct actual source-authorizer/shared-upsert probes deny the synthetic source even if accidentally allowlisted, with zero writes. No cloud seed, deployment, auth/grant/config or guide changes.
- Next: independent adversarial policy tests and frontend/browser acceptance; then owner MCP sample seed. Orchestrator handles documentation.
