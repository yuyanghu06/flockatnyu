# raw cleanup and live smoke verified

- Local timestamp / acting role / milestone: 2026-10-15T16:44:39.433551-04:00 / orchestrator / M25–M26.
- Requested scope: Complete authorized live-first/summary-only integration and verification.
- Starting repository state: Existing uncommitted work on codex/dev preserved, including concurrent Miro/avatar work.
- Work performed / changed files: Explicit cutover(deleteRawtrue) removed1174raw messages plus1revision and copied originals. Legacy summary/hash,2245receipts/hash,722certificates and policy match baseline. Metadata-only deployed worker completed discovery with219current sources. First summary invocation during discovery conservatively planned0/noembeddingdispatch because incomplete catalogue; returnedpartial. After discovery completion root retriggered Railway summary worker and bounded local catchup/embedding drains.438closed-period jobs planned; vectors and results are now progressing. Hosted natural cron invocation not yet observed.
- Decisions: Live Discord primary; stored summaries fallback only and permission-scoped. No durable original message copies.
- Checks and evidence: evidence/m25-cloud preservation.json and live-chat-smoke.json; evidence/m25-connectors/independent-report.md; final Discord log in evidence/m25-summary-only.
- Resulting state / acceptance: Local provider adjustment accepted; raw cleanup/preservation proven. Cloud catchup remains in progress.
- Remaining work and handoff: Drain/verify vectors and initialclosed-period backlog, independent hosted audit, account OAuth consent and production member access.
