# Dedicated events: events-relationship-contract

- Local timestamp / acting role / milestone: 2026-10-18T12:59:53.308968-04:00 / planner / events-relationships.
- Requested scope: implement approved events and relationship tables with multi-location visibility.
- Starting repository state: concurrent assistant/map UI and journal edits; preserved.
- Work performed / decisions / evidence: Inspected existing migrations021–025, presence UI/API, automation tools, source policies and PGlite tests. Agreed normalized three-table design and bounded snapshot/optimistic event RPC contracts. No planner files changed or tests run. Source UUIDs deliberately have no knowledge_sources FK because Discord has a separate catalogue. Legacy report timestamps are unavailable: migration uses source-window start as documented proxy and preserves existing windows exactly. Full schema, backend projection and agent-tool implementations assigned exclusive ownership; root owns cloud operations, journal and integration. Prior UI/journal edits preserved. Implementation and all acceptance checks remain pending.
- Remaining work and handoff: see rolling snapshot and active to-do.
