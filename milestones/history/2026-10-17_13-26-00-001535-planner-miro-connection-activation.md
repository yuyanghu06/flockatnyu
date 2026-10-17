# Miro connection activation plan

- Local timestamp / acting role / milestone: 2026-10-17_13-26-00-001535; planner miro_connection_plan; M27 resumed.
- Requested scope: activate existing Miro integration for the club board.
- Starting repository state: extensive existing dirty work preserved; Miro integration implemented but token and scope missing; M33 separate work remains pending.
- Work performed / changed files: independent read-only review of Miro worker/config/store/tools, API wiring/auth, migrations and deployment receipts; no specialist file edits.
- Decisions: no new connector or migration needed. Exact board + server-only boards:read token; preflight before command-scoped first sync; append verified source UUID preserving existing source allowlist; verify live tools before scheduled activation. Existing implementation requires non-expiring token and has no refresh flow.
- Checks and evidence: specialist cat/sed/rg/git inspection; no independent live calls/tests. Root additionally verified local/hosted token absent and live Supabase Miro/source tables empty. Railway CLI authenticated; MCP unauthorized.
- Resulting state / acceptance: plan accepted; connection not yet established. Production developmentAuth denial means worker readiness cannot imply hosted chat readiness.
- Remaining work and handoff: root owns secure configuration, board preflight, complete snapshot/readback, local API reads, Railway activation and journal. User authorized accepting the displayed Miro developer terms and creating the developer team at action time.
