# Supabase MCP setup status

The nonsecret connection inventory and exact scope live only in [AGENTS.md](../AGENTS.md#local-mcp-policy-override-2026-10-11). MCP connection configurations are local and ignored; tracked `.codex` agent settings remain intact.

The earlier Windows config-write denial is historical. The user subsequently reported completing setup/auth, and the CLI showed the scoped server enabled with `auth_status: unknown`. This session exposed no callable Supabase tools and obtained no authenticated database response. Registration is verified; database connectivity is not. No migration or cloud data change was performed.

The user has stopped connection retries for this snapshot. A later authorized verification should obtain an actual read-only project response. Developer OAuth does not provide the application's server-side service credential or member authentication. Do not paste credentials into chat or commit local connection files.
