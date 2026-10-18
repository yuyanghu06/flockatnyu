# Live Miro connection

mcp-config.js fixes the official origin, board/team scope and resource limits. mcp-client.js uses the official SDK with a three-read-tool allowlist, bounded HTTP/SSE and sanitized errors. mcp-auth.js owns application OAuth credentials, private atomic storage, refresh rotation and interprocess locking. scripts/miro-connect.mjs performs local consent; developer Codex authentication is separate.

store.js exposes only the service-only authorizedBoard registry RPC. Migration030 moves the old board enable/team metadata into knowledge_sources and deletes snapshot storage/sync routines. No REST client, collector, CLI or cached-content fallback remains. ../tools/miro/mcp.js supplies the same scoped reader to chat and update agents. No Miro writes or automatic source expansion are available. See ../../docs/miro-sync.md.

navigation.js contains shared, board-scoped structural hints for chat and update prompts. It performs no I/O and grants no source or mutation access. Revalidate section/month/legend context live; copied years remain ambiguous until corroborated.

Production web is the sole rotating OAuth owner on a private persistent volume. token-broker.js authorizes worker access-token requests separately from browser sessions; workers contact official MCP directly without refresh credentials. Queue is bounded to64waiting operations and canceled waiters reject promptly. Local OAuth copies must not continue refreshing after ownership transfer.
