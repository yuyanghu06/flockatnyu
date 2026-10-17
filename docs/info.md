# Project documentation

The [milestone snapshot](../milestones/milestone.md) and [to-do list](../milestones/to-do.md) hold current implementation/evidence and unfinished work. [Immutable history](../milestones/history/info.md) preserves previous decisions. Guides describe current contracts; historical commands are not operational instructions.

## Backend and integrations

- [assistant-backend.md](assistant-backend.md): floating assistant, local API, streaming, source scope and runtime boundaries.
- [backend-direction.md](backend-direction.md): current product/service architecture.
- [discord-live-only.md](discord-live-only.md): bot-only content reads, request-memory summaries, timezone behavior and the single metadata table.
- [discord-launch.md](discord-launch.md): supported metadata/live-access operations. [discord-archive.md](discord-archive.md) points to retired designs and immutable cutover evidence.
- [database-tables.md](database-tables.md): the five current service-only tables.
- [google-connector.md](google-connector.md): account-authorized Gmail/Drive tools and Gmail receiver setup/status.
- [agent-automation.md](agent-automation.md): temporary input cache, event updater, handler prompt, trusted adapters and activation boundaries.
- [miro-sync.md](miro-sync.md): scoped board ingestion and direct read-only tools; [miro-api-research.md](miro-api-research.md) records API research and coverage limits.
- [schema-cleanup-audit.md](schema-cleanup-audit.md): historical pre-cleanup assessment; follow the milestone and current table guide for applied state.
- [supabase-mcp-setup.md](supabase-mcp-setup.md): developer connection setup history, separate from runtime credentials.

Railway production contains continuous `discord-events`, active `gmail-events` and paused `miro-sync`. Discord creates and a real Gmail email have reached the shared temporary cache. No LLM service or Calendar write adapters are deployed. Live Discord edit/delete and blacklist probes remain pending. Integration owners maintain their own guides; shared workflow/journal changes belong to the orchestrator.

## Map, design and workflow

[agent-workflow.md](agent-workflow.md) explains role ownership and handoff; `templates/` supplies assignment, report and history formats. `initial-map-prompt.md` is the original implementation request, not an implementation claim.

Building reference guides record inspected sources, placement/geometry contracts and approximation limits: `paulson-reference.md`, `silver-towers-reference.md`, `leslie-elab-reference.md`, `gould-plaza-reference.md`, `kimmel-reference.md`, `silver-center-reference.md`, `global-center-reference.md` and `courant-stern-detailing.md`. Some describe superseded models; preserve their provenance.

`streets-parks-data.md`, `streets-rendering.md`, `parks-rendering.md` and `park-vegetation.md` describe offline data, layering and planting bounds. `map-presentation.md`, `hover-reference.md`, `camera-navigation.md`, `union-square-context.md`, `map-performance.md`, `map-performance-research.md` and `loading-screen.md` explain presentation/input/loading contracts and evidence limits. `color-schemes.html` and `color-schemes.md` are design proposals and token notes.

`avatars/` contains the 26 current generated low-poly profile PNGs with readable person names. The original scratch `output/` directory was deleted at the user’s request; these retained documentation images are not source photos.

[Cleanup handoff](cleanup-handoff.md) defines current folder ownership for parallel map/UI, agent and collector work.

[Initial MVP architecture](architecture.md) records the confirmed service direction, current deployed behavior, shared-tool intent and remaining implementation work.
