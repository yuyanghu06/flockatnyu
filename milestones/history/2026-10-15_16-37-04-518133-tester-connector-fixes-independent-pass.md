# Independent connector regression verification

- Local timestamp / acting role / milestone: 2026-10-15T16:37:04.518133-04:00 / tester / M25–M26.
- Requested scope: Independent connector regression verification.
- Starting repository state: codex/dev, existing uncommitted map, Spotlight, connector and concurrent Miro/avatar work preserved; no Git publication.
- Work performed / changed files: Tester added live-window helper, fallback and ancestry regressions; updated assigned API/store expectations without restoring raw archive defaults. Evidence: evidence/m25-connectors/independent-report.md.
- Decisions: Discord live reads first; Supabase summaries only disclosed fallback, never permission-denial bypass or replacement of successful empty reads.
- Checks and evidence: 132/132 passed, zero skips; ancestry suite19/19. No external calls.
- Resulting state / acceptance: Local behavior accepted; hosted operations only as explicitly recorded.
- Remaining work and handoff: Verify deployed images/commands, embeddings, preservation and raw cleanup. Google account OAuth consent remains pending; production member access remains denied.
