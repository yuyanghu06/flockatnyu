# Existing map tools correction planned

- Local timestamp / acting role / milestone: 2026-10-22T16:01:12.305128-04:00 / planner, serialized by orchestrator / chat-map-clarification.
- Requested scope: User rejects the separate report architecture and requests removing the chat map blockers, with model prompting handling intent and missing facts. Discord-to-person mapping must still be included when tools run.
- Starting state: Rejected design was local only, never deployed; concurrent staged worker and unrelated source/release changes preserved.
- Work performed / changed files: Read-only planner inspected existing map adapter, shared service, provenance schema and runtime. No code edits or external operations.
- Decisions: Delete the two resolver/save modules, parser/cache, session HMAC and dedicated tests; use existing read_map_events/lookup_map_person/upsert_map_event. Chat schemas permit source-free actor/name lookup and omitted attribution. Ordinary auth/data/catalogue/revision validation remains, worker source authority unchanged. Accurate internal source attribution stays as minimal existing-file metadata.
- Checks and evidence: Static source/diff inspection only.
- Resulting state / acceptance: Bounded correction brief accepted; prior architecture explicitly superseded, not a deployed rollback.
- Remaining work and handoff: Implement existing adapter/runtime/prompts, preserve tool-time Discord mapping, independently test and evaluate.
