# Apply accepted summary schema and begin Railway rollout

- Local timestamp / acting role / milestone: 2026-10-15T16:37:04.518136-04:00 / orchestrator / M25–M26.
- Requested scope: Apply accepted summary schema and begin Railway rollout.
- Starting repository state: codex/dev, existing uncommitted map, Spotlight, connector and concurrent Miro/avatar work preserved; no Git publication.
- Work performed / changed files: Captured hosted metadata baseline, applied additive011 via Supabase migration API (hosted version20261015203437), enabled summary-only guard with policyrevision3 without deleting originals, provisioned218 read-only grants for explicit local-development scope and corresponding ignored local allowlist. Updated existing Railway archive service to metadata-only discovery daily10UTC; summary service hourly at minute10 with live-summary CLI and summary embeddings. Prepared allowlisted50file context and started both deployments.
- Decisions: Discord live reads first; Supabase summaries only disclosed fallback, never permission-denial bypass or replacement of successful empty reads.
- Checks and evidence: Service-role status verifies summaryOnlytrue,722legacy summaries,1174raw pending cleanup and722missing vectors. Hosted deployment/build/embedding/cleanup verification remains in progress. No Google credentials supplied.
- Resulting state / acceptance: Local behavior accepted; hosted operations only as explicitly recorded.
- Remaining work and handoff: Verify deployed images/commands, embeddings, preservation and raw cleanup. Google account OAuth consent remains pending; production member access remains denied.
