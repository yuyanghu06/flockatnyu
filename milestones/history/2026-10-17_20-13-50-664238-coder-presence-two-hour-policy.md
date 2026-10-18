# Presence two hour policy

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664238-04:00 / coder / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Apply user answer: two hours unless updated for explicit current reports without an end.
- Starting repository state: Shared structured prompt implemented; current-report expiry policy was unresolved.
- Work performed / changed files: Added immutable PRESENCE_DEFAULT_POLICY and 7200-second constant, embedded instructions/examples and guide updates.
- Decisions: Anchor to original provider report timestamp. New explicit current-location confirmation refreshes; activity-only edits do not. Explicit ends override; no delayed resurrection or future-plan inference.
- Checks and evidence: Independent intermediate presence-policy run passed203/203; final policy checks included in subsequent combined/focused runs.
- Resulting state / acceptance: Approved current-presence freshness policy wired into the prompt; no map writer activated.
- Remaining work and handoff: Add separately approved event policy, retaining independent presence/event semantics.
