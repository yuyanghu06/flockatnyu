# M20 calendar contract guides and live read check

- Local timestamp / acting role / milestone: 2026-10-11T19:12:15.345070-04:00 / orchestrator / M20.
- Requested scope: Current Monday–Sunday raw, per-channel summaries, names alongside IDs; RAG only.
- Starting repository state: Calendar coders/tester active;006 unapplied, archive intact.
- Work performed / changed files: Updated discord-archive.md/discord-launch.md and milestone/folder guides to supersede rolling168h and current-week month-close deletion. Inspected API tool plumbing; no automatic summary prompt injection exists.
- Decisions: Verified monthly prefix plus prior-month tail completes after crossing week ends; preserve current-week originals. No embedding or proactive output.
- Checks and evidence: git diff --check passed. Read-only hosted totals108836 originals,1769 current-week originals,213 nonempty sources out of216 eligible, zero embeddings.216/216 eligible sources have nonempty title. Railway filtered status confirms archive SUCCESS/stopped one-shot, cron15 6 * * *, next2026-10-12T06:15:00Z. Calendar helper checksOct11→Oct5EDT,Nov1→Oct26EDT,Nov2→Nov2EST passed.
- Resulting state / acceptance: Contract/docs synchronized; local calendar lifecycle and review still pending. No cloud mutations or model calls in this pass.
- Remaining work and handoff: Final coder/tester reports, evaluator, reviewed006 apply, hosted timing, bounded actual pilot and authorized historical compaction, then separate Railway summary service.
