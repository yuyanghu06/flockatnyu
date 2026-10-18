# Miro MCP integration plan

- Local timestamp / role: 2026-10-18T13:29:01.256068-04:00 / planner.
- Scope: user-authorized switch for chat and update agents.
- Starting state: existing uncommitted event/UI work preserved.
- Work and decisions: Read-only specialist planner inspected shared tools, chat serialization, automation preflight and Calendar provenance. Plan: shared read-only official MCP adapter, replace hidden REST frame preflight, preserve board/source checks and fixed Google Calendar writes, accept only actual content as write evidence. Table-contained events need provider-stable individual identities; one table ID cannot represent several events. Live OAuth schemas and exact schedule acceptance remain required. Existing worker/Calendar access deferrals persist. Root installed official endpoint through shared Mac config, sync/check passed, and Codex read-only OAuth login succeeded. App OAuth remains separate. No live source content/model calls/writes verified.
- Files changed by planner: none.
- Checks: read-only repository review; no tests.
- Acceptance: plan complete, implementation pending.
- Handoff: transport coder owns new MCP config/client/auth and app consent CLI; root owns integration/dependencies/journal, tester follows.
