# Supabase MCP setup status

The nonsecret connection inventory and exact project endpoint live in [AGENTS.md](../AGENTS.md#local-mcp-policy-override-2026-10-11). MCP connection settings remain private and outside Git; tracked `.codex` agent settings remain intact.

On October 22, 2026, the requested connection was missing on the current Mac. It is now installed in normal account-local Codex settings, authenticated through the user’s browser and verified against the exact project endpoint. Read-only OAuth consent replaced the initial broad default consent before authorization; the read-only scopes are saved for future logins.

Verification passed: CLI enabled/OAuth status, live server tool discovery with no tool error, and `SELECT 1 AS connection_ok` returning `1`. All five scoped database/documentation tools are exposed to this chat. The older unrelated stdio registration remains unchanged and was not used. No private table contents were read; no schema or data was changed. These were primary-agent operational checks, without an independent specialist pass.

Earlier Windows setup failures and the request to stop retries remain historical. Developer OAuth is separate from application service credentials and member authentication. Do not paste credentials into chat or commit local connection files. [Pass receipt](../milestones/history/2026-10-22_20-42-16-051966-orchestrator-scoped-supabase-mcp-connected.md).
