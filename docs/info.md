# Project documentation

The [milestone snapshot](../milestones/milestone.md) and [to-do list](../milestones/to-do.md) hold current implementation/evidence and unfinished work. [Immutable history](../milestones/history/info.md) preserves previous decisions. Guides describe current contracts; historical commands are not operational instructions.

## Backend and integrations

- [assistant-backend.md](assistant-backend.md): chat agent, local API, streaming, source scope and runtime boundaries.
- [backend-direction.md](backend-direction.md): current product/service architecture.
- [discord-live-only.md](discord-live-only.md): bot-only content reads, request-memory summaries, timezone behavior and the single metadata table.
- [discord-launch.md](discord-launch.md): supported metadata/live-access operations. [discord-archive.md](discord-archive.md) points to retired designs and immutable cutover evidence.
- [database-tables.md](database-tables.md): the five current service-only tables.
- [google-connector.md](google-connector.md): account-authorized Gmail/Drive tools and Gmail receiver setup/status.
- [agent-automation.md](agent-automation.md): update agent, temporary input cache, per-batch Miro preparation, fixed-target Calendar tools, prompt and activation boundaries.
- [miro-sync.md](miro-sync.md): scoped board ingestion and direct read-only tools; [miro-api-research.md](miro-api-research.md) records API research and coverage limits.
- [schema-cleanup-audit.md](schema-cleanup-audit.md): historical pre-cleanup assessment; follow the milestone and current table guide for applied state.
- [supabase-mcp-setup.md](supabase-mcp-setup.md): developer connection setup history, separate from runtime credentials.

Railway production contains the password-gated website/chat API, enabled update-agent worker, continuous Discord collector and Gmail collector. The old Miro sync service is retired; both agents read official MCP live. Actual processing and Calendar/map projection receipts, current releases and remaining source outages live in the rolling milestone. Integration owners maintain their own guides; shared workflow/journal changes belong to the orchestrator.

## Map, design and workflow

[agent-workflow.md](agent-workflow.md) explains role ownership and handoff; `templates/` supplies assignment, report and history formats. `initial-map-prompt.md` is the original implementation request, not an implementation claim.

Building reference guides record inspected sources, placement/geometry contracts and approximation limits: `paulson-reference.md`, `silver-towers-reference.md`, `leslie-elab-reference.md`, `gould-plaza-reference.md`, `kimmel-reference.md`, `silver-center-reference.md`, `global-center-reference.md` and `courant-stern-detailing.md`. Some describe superseded models; preserve their provenance.

`streets-parks-data.md`, `streets-rendering.md`, `parks-rendering.md` and `park-vegetation.md` describe offline data, layering and planting bounds. `map-presentation.md`, `hover-reference.md`, `camera-navigation.md`, `union-square-context.md`, `map-performance.md`, `map-performance-research.md` and `loading-screen.md` explain presentation/input/loading contracts and evidence limits. `color-schemes.html` and `color-schemes.md` are design proposals and token notes.

[`../assets/avatars/`](../assets/avatars/) contains the 26 current generated low-poly profile PNGs with readable person names. The original scratch `output/` directory was deleted at the user’s request; these retained documentation images are not source photos. Map exports, derived geometry/data and reference text also live under [`../assets/`](../assets/info.md). Historical requests and recorded evidence retain their original asset paths.

[Cleanup handoff](cleanup-handoff.md) defines current folder ownership for parallel map/UI, agent and collector work.

[Initial MVP architecture](architecture.md) records the confirmed service direction, current deployed behavior, shared-tool intent and remaining implementation work.

`map-presence.md` documents the protected map read API, circular portrait overlay, temporary Bobst fixture commands, source-policy boundaries and debug/test handoff.

update-agent-prompt.md describes the actual runtime prompt/shared JSON contracts, the approved two-hour presence/event policies, safe interpretation/completion rules and remaining tool/deployment boundaries.

`events.md` describes the normalized events/event_buildings/event_people schema, multi-location visibility, source-authorized reads, optimistic RPC writes and staged legacy-column cutover. It supersedes older building-owned presence/event JSON descriptions once the rolling snapshot records hosted cutover.

miro-sync.md now documents live MCP access shared by both agents, application OAuth refresh, metadata-only registry policy and fixed Google Calendar reconciliation; the former snapshot worker is retired.

`bug-reports.md` describes the minimal hosted table, structured chat tool, write boundary and verification.

`long-term-memory.md` describes automatic shared club memory, injection, optimistic updates and schema/live verification.

`chat-agent-prompt.md` records calm chat, eboard/general/team routing, Calendar-first/Miro fallback and evidence-backed map tools. `update-agent-prompt.md` records the autonomous planner/update contract. Configured-model smoke evidence lives under evidence/agent-prompts; synthetic fixtures exercise behavior without writing club source events.

chat-agent-prompt.md includes user-directed fixed Calendar writes and the existing authorized Drive search/read behavior; autonomous planner provenance remains separate.

`deployment.md` describes the private Railway website, isolated collectors/worker, environment-only gate and sole persistent Miro OAuth owner. Actual launch receipts remain in the milestone journal.

Miro quota recovery uses shared operational counters and cooldowns in existing service-only automation state, without storing board contents. See miro-sync.md for the UTC reset, protected chat budget and background cadence.

model-audit.md explains private planner/chat model-call and output accounting, null usage/cost limits, credential redaction, service-only access and seven-day retention.

`discord-chat.md` documents shared assistant execution, verified caller context, eboard source/audience rules, private bridge setup and transient interaction limits.

[drive-skill.md](drive-skill.md) describes shared Tech@NYU Drive guidance, selective runtime activation, read-only folder navigation and private research boundaries.
