# M20 calendar week and channel name scope

- Local timestamp / acting role / milestone: 2026-10-11T19:08:53.137871-04:00 / orchestrator / M20.
- Requested scope: Verified per-channel RAG storage retention; exact Luna, no daily summaries/images/embeddings.
- Starting repository state: Unapplied006, live M18 archive intact; concurrent accepted M21 map work preserved.
- Work performed / changed files: User now explicitly requires per-channel summaries, current Monday–Sunday week raw, and channel names alongside IDs. Assigned exclusive storage/runner coders and independent tester.
- Decisions: Final correction protects the current NY calendar week across month boundaries. Earlier rolling-window behavior is historical.
- Checks and evidence: No new cloud/schema/model operation. Existing108836 originals remain intact;006 unapplied. Scope supersedes rolling168h and month-closure deletion of current-week raw. Report/check: milestones/m20-discord-summaries/info.md.
- Resulting state / acceptance: Local partial verification; final calendar lifecycle and independent review pending.
- Remaining work and handoff: Calendar/DST/month-boundary/names tests, largest SQL publication, integrated checks, reviewed006 apply, bounded real Luna pilot, historical compaction and Railway summary service.
