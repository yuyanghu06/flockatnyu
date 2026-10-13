# M20 retention storage and planning optimized

- Local timestamp / acting role / milestone: 2026-10-11T19:08:53.136348-04:00 / coder / M20.
- Requested scope: Verified per-channel RAG storage retention; exact Luna, no daily summaries/images/embeddings.
- Starting repository state: Unapplied006, live M18 archive intact; concurrent accepted M21 map work preserved.
- Work performed / changed files: Implemented verified mixed-input publication/pruning, ledger ingestion guard and scoped reset in unapplied006/store.
- Decisions: Final correction protects the current NY calendar week across month boundaries. Earlier rolling-window behavior is historical.
- Checks and evidence: Focused genuine SQL14/14 and pure51/51 passed. Independent scale preview8.92s/begin10.51s/repeat9.18s after manifests materialization. Largest publication still blocked by72-child reduction. Report/check: evidence/m20-discord-summaries/retention-storage-coder-report.md.
- Resulting state / acceptance: Local partial verification; final calendar lifecycle and independent review pending.
- Remaining work and handoff: Calendar/DST/month-boundary/names tests, largest SQL publication, integrated checks, reviewed006 apply, bounded real Luna pilot, historical compaction and Railway summary service.
