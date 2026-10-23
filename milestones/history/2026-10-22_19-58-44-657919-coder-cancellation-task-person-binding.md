# cancellation task person binding

- Timestamp / role: 2026-10-22T19:58:44.657919-04:00 / coder
- Scope: User-authorized cancellation task completion fix; unrelated changes preserved.
- Work / checks / result: Independent review requested that a saved Member Plans task naming a person must match the cancellation argument personId. Added only that guard to the new adapter branch; syntax/whitespace pass. Isolated package refreshed with that exact adapter; other files remain deployed6434 bytes.
- Handoff: Orchestrator packages and verifies worker deployment; no schema/env/chat/collector changes.
