# M14 Supabase MCP setup

Goal and scope: establish the requested project-restricted, read-only developer MCP connection using normal Codex client settings and browser OAuth; preserve tracked agent configuration and application/database state.

Completion criteria: exact endpoint registration, successful OAuth, live tool discovery and a successful read-only database response.

Status: completed on the current Mac on October 22, 2026. The CLI reports enabled/OAuth; the live server exposes five tools without a tool error and `SELECT 1 AS connection_ok` returned `1`. The user completed read-only consent. Earlier Windows failures are historical. The exact nonsecret inventory is in AGENTS.md, with current verification in the rolling milestone. No schema or source-data writes occurred.
