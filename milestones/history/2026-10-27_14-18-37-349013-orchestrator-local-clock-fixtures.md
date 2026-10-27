# Local-clock runner fixtures repaired and verified

- Local timestamp / acting role: 2026-10-27_14-18-37-349013 / orchestrator.
- Root owned agent-local-clock-boundaries.test.mjs. Preserved summer/winter/fractional/non-hour-zone conversion, DST gaps/folds, exact raw endpoint copies, canonical action hashing and opaque preparation scope/replay checks.
- Updated fixture current source revocation to a named exact-URL source read; invalid action stays unhandled/round-limited rather than falsely completed. Reservation accounting distinguishes the proposal round from separately named later Calendar sync. Successful own writes explicitly finish their original.
- Evidence: all seven actual production-handler/adapter tests pass; no app behavior change or live services in this test repair pass.
