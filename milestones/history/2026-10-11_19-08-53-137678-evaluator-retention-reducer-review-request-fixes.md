# M20 retention reducer review request fixes

- Local timestamp / acting role / milestone: 2026-10-11T19:08:53.137678-04:00 / evaluator / M20.
- Requested scope: Verified per-channel RAG storage retention; exact Luna, no daily summaries/images/embeddings.
- Starting repository state: Unapplied006, live M18 archive intact; concurrent accepted M21 map work preserved.
- Work performed / changed files: Independent read-only review requested64-child packing fix and integrated/publication retest.
- Decisions: Final correction protects the current NY calendar week across month boundaries. Earlier rolling-window behavior is historical.
- Checks and evidence: Pure51/51 and focused SQL15/15 passed; new65-map regression reproduced failure. No hosted acceptance. Report/check: evidence/m20-discord-summaries/retention-tester-report.md.
- Resulting state / acceptance: Local partial verification; final calendar lifecycle and independent review pending.
- Remaining work and handoff: Calendar/DST/month-boundary/names tests, largest SQL publication, integrated checks, reviewed006 apply, bounded real Luna pilot, historical compaction and Railway summary service.
