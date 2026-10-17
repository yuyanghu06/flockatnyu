# Retire default raw collection entrypoints

- Local timestamp / acting role / milestone: 2026-10-15T16:37:04.518135-04:00 / coder / M25–M26.
- Requested scope: Retire default raw collection entrypoints.
- Starting repository state: codex/dev, existing uncommitted map, Spotlight, connector and concurrent Miro/avatar work preserved; no Git publication.
- Work performed / changed files: Daily worker and worker:discord now discover metadata only. Weekly/monthly npm scripts and Docker default use live-summary CLI. Legacy preview/bootstrap remain explicitly documented. Files: server/worker.js, package.json, deployment/discord-worker and assigned launch tests.
- Decisions: Discord live reads first; Supabase summaries only disclosed fallback, never permission-denial bypass or replacement of successful empty reads.
- Checks and evidence: 43 targeted tests, API validation and prepared-context smoke passed; root73 focused summary/SQL/launch checks passed. No cloud calls by specialist.
- Resulting state / acceptance: Local behavior accepted; hosted operations only as explicitly recorded.
- Remaining work and handoff: Verify deployed images/commands, embeddings, preservation and raw cleanup. Google account OAuth consent remains pending; production member access remains denied.
