# miro-mcp-transport

- Local timestamp / role: 2026-10-18T13:36:10.376013-04:00 / coder.
- Scope: shared live Miro MCP reader.
- Starting state: existing event/UI changes preserved.
- Work, decisions and checks: Official fixed-origin SDK MCP transport, three read-tool allowlist, private app OAuth PKCE/DCR and refresh rotation implemented. Live app schemas and canvas read passed, actual access/refresh rotation proven. Miro returns boards:write despite read-only request; no write tools exposed. Upstream encoded%3D board URLs fail; raw validated IDs succeed. CLI socket cleanup follows. Four new auth/transport files; syntax and inline mocked error/privacy/budget checks passed.
- Acceptance/handoff: live HTTP and independent acceptance still pending; follow latest scope removing snapshots. No credentials or private source contents in tracked evidence.
