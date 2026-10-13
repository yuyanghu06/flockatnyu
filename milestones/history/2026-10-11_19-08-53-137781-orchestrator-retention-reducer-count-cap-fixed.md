# M20 retention reducer count cap fixed

- Local timestamp / acting role / milestone: 2026-10-11T19:08:53.137781-04:00 / orchestrator / M20.
- Requested scope: Verified per-channel RAG storage retention; exact Luna, no daily summaries/images/embeddings.
- Starting repository state: Unapplied006, live M18 archive intact; concurrent accepted M21 map work preserved.
- Work performed / changed files: Capped reducer batches at64 children as well as input bytes in summaries.js, preserving SQL guard.
- Decisions: Final correction protects the current NY calendar week across month boundaries. Earlier rolling-window behavior is historical.
- Checks and evidence: node --test tests/discord-summaries.test.mjs:26/26 passed including65-map multi-level reduction and cached resume. Largest SQL retest pending. Report/check: tests/discord-summaries.test.mjs.
- Resulting state / acceptance: Local partial verification; final calendar lifecycle and independent review pending.
- Remaining work and handoff: Calendar/DST/month-boundary/names tests, largest SQL publication, integrated checks, reviewed006 apply, bounded real Luna pilot, historical compaction and Railway summary service.
