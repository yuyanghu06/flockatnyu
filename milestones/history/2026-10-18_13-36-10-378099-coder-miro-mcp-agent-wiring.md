# miro-mcp-agent-wiring

- Local timestamp / role: 2026-10-18T13:36:10.378099-04:00 / coder.
- Scope: shared live Miro MCP reader.
- Starting state: existing event/UI changes preserved.
- Work, decisions and checks: Both production agents now instantiate shared MCP tools. Automation preflight uses prepareBoard rather than REST content. Live content-only observed source keys gate Calendar/map writes; stable table-row keys distinguish records. Existing fixed Calendar/human-edit protections retained. Six implementation files updated;64targeted checks pass plus context17. Root wrapper/live chat acceptance pending; legacy fixtures remain only explicit test injections.
- Acceptance/handoff: live HTTP and independent acceptance still pending; follow latest scope removing snapshots. No credentials or private source contents in tracked evidence.
