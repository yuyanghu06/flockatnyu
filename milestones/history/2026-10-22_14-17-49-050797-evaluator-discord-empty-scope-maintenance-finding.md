# Empty Discord scope maintenance finding

- Local timestamp / acting role / milestone: 2026-10-22T14:17:49.050797-04:00 / evaluator (discord_policy_plan) / discord-blacklist.
- Requested scope: Independently review new automatic Discord grants and queue boundaries.
- Starting repository state: Chat and worker code complete; independent integrations passed; no release yet.
- Work performed / changed files: Read-only review of actual diff, map/Calendar gates, new tests and migration036. Evaluator changed no files; orchestrator records report.
- Decisions: REQUEST FIXES for P2 handler early return on an empty current claim scope: it bypasses036 expired quarantine cleanup and lease recovery, allowing retained bodies beyond24hours if all Discord channels are unavailable and no Gmail grant exists. Must add a source-free maintenance poll; never restore static or sentinel source authority.
- Checks and evidence: Evaluator ran150focused helper/app/integration/worker/reliability/map/chat checks, all passed; whitespace check passed. Core access behavior met requirements, but review found untested retention regression.
- Resulting state / acceptance: Core dynamic authorization accepted in principle; milestone not complete. No live deployment or schema changes by evaluator.
- Remaining work and handoff: Worker coder assigned forward038 allowing empty scoped claims, JS store/handler support and SQL-backed retention/fencing tests. Keep036 immutable; review/apply only after independent acceptance through configured Supabase MCP.
