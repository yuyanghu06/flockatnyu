# Discord channel discovery explained

- Local timestamp / acting role / milestone: 2026-10-22T13:30:44.867842-04:00 / orchestrator / read-only channel discovery explanation.
- Requested scope: Explain how Flockbot discovers a newly created Discord channel.
- Starting repository state: Clean working tree; latest rolling entry records verified combined Railway release and pending GitHub publication.
- Work performed / changed files: Inspected Gateway metadata dispatch, periodic refresh, discovery phases, channel permission checks, collector fallback and assistant/update-agent source authorization. Only journal files changed.
- Decisions: Channel/thread creation, update and deletion trigger discovery; normal periodic cadence is one hour. An eligible incoming message missing from the catalogue also requests refresh. Discovery checks View Channel and Read Message History, inherited exclusions and manual disables; new channel identities publish only after completed discovery. Collector ingestion and assistant authorization are separate: new source UUIDs do not automatically enter ASSISTANT_ALLOWED_SOURCE_IDS. Chat and update-agent processing need the appropriate configured grant.
- Checks and evidence: Read server/discord/gateway.js, event-cli.js, event-config.js, metadata-refresh.js, discovery.js, event-listener.js, client.js, chat-access.js, live-retrieval.js, server/config.js, server/automation/adapters.js and migration035. No tests or fresh live service/database checks were run; no newly created channel was supplied to verify.
- Resulting state / acceptance: Explanation supported by current implementation. Application code, source grants and deployment unchanged.
- Remaining work and handoff: No implementation requested. If a channel is created, verify completed catalogue discovery and grant its exact source UUID to the intended services before expecting replies or autonomous processing. Existing release/publication work remains unchanged.
