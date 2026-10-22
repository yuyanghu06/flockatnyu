# Discord blacklist versus source allowlist clarified

- Local timestamp / acting role / milestone: 2026-10-22T13:31:36.824047-04:00 / orchestrator / channel discovery explanation.
- Requested scope: Clarify user expectation that Discord uses a blacklist.
- Starting repository state: Prior explanation journal changes pending; application tree unchanged.
- Work performed / changed files: Rechecked docs/discord-live-only.md, docs/discord-chat.md, server/config.js, server/discord/chat-access.js and server/automation/adapters.js. Journal-only changes.
- Decisions: Blacklist-based Discord discovery and incoming-event ingestion are implemented. Chat and autonomous processing additionally enforce configured source UUID grants. The previous explanation described an existing implementation requirement; it should not present manual per-channel grants as the desired blacklist-only experience. User's correction identifies a product/implementation mismatch requiring a separately scoped implementation pass if requested.
- Checks and evidence: Read-only local code/document inspection; no live checks, tests, configuration writes or permission expansion.
- Resulting state / acceptance: Explain both current layers and acknowledge the mismatch. No runtime change requested or performed.
- Remaining work and handoff: Potential follow-up is to reconcile Discord agent authorization with automatic blacklist-based channel eligibility while preserving excluded ancestry, manual disables, bot/member permissions and unrelated source grants. Existing pending release/publication work unchanged.
