# Supabase MCP OAuth and read-only preflight restored

- Acting role: ephemeral CLI MCP tester, supervised by orchestrator; user requested MCP instead of UI.
- Initial CLI startup required renewed Supabase OAuth; normal codex mcp login completed successfully. Other persisted MCP servers were disabled only for the invocation; no connection config changed. Initial malformed invocation overrides failed before session creation and were corrected.
- A first read-only tool request could not run under the CLI's never-request-approval policy. The normal --approve-for-me review mode was then used; no approval bypass or permission grant was introduced. Required Supabase MCP execute_sql succeeded on exact projectjssehnrmqhstcrtxulpa.
- Result: nine catalogue rows, absent683-broadway, zero target links; existing-catalogue MD5 6553fd9b09534d5b3d6e7c99b727b24e; event/relationship counts22/9/3; service catalogue DML denied; latest hosted035. No mutation in this pass.
