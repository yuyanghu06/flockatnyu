# Collector crash diagnostics contract

- Local timestamp / acting role / milestone: 2026-10-21T12:38:37.446488-04:00 / planner / collector failure logging.
- Requested scope: user explicitly requests logging so future Discord collector crashes have identifiable causes.
- Starting repository state: diagnostic journals from confirmed outage remain uncommitted; runtime unchanged.
- Work performed / changed files: independent read-only Gateway/CLI/checkpoint/metadata/SDK inspection; parent assigns coder exclusive runtime ownership and tester separate regression ownership.
- Decisions: preserve current fatal/restart/checkpoint/source behavior. Add fixed failure stages and strict allowlisted error codes, bounded numeric status/counters, and safe nested cause classification. Unknown errors get a fixed fallback. No arbitrary messages, stacks, URLs, session/provider identities, credentials or raw source contents in structured logs. Distinguish fatal SDK Error from nonfatal SocketError; periodic refresh remains nonfatal. Include startup and shutdown visibility.
- Checks and evidence: static contract; prior49collector tests passed in earlier review, no new checks claimed here. SDK forwarding confirmed error plus shardId.
- Resulting state / acceptance: bounded implementation contract accepted; implementation and independent tests underway. Collector-only rollout planned after review/build/package gates.
- Remaining work and handoff: exercise fatal-stage/privacy/checkpoint regressions; verify new live startup diagnostic and single healthy resumed collector. No historical crash reason can be reconstructed from this change.
