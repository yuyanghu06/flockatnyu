# Location-only activity label correction

- Local timestamp / acting role / milestone: 2026-10-21T13:11:28.643518-04:00 / coder / personal-location-behavior.
- Scope / starting state: final model behavior had corrected kind/deadline but echoed building as activity label.
- Work/files: added final shared/chat pre-upsert check requiring people[].label="" for location-only statements, never the building name. Updated docs/events.md. All other original-source/identity/stable-source/current-v-planned/explicit-end requirements preserved. No tool authorization or database/schema changes.
- Checks/evidence:44focused prompt/chat-policy tests and scoped whitespace pass; final automation prompt24555/24576bytes. Parent final API syntax/runtime-dependency build passes. Files frozen before final probe.
- Result/handoff: correction implemented; independent final stable model probe reported passing, integration records separate tester/orchestrator acceptance. No production activation or real activity writes.
