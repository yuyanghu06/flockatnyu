# Chat map read timeout traced independently

- Local timestamp / acting role / milestone: 2026-10-23T15:00:23.870811-04:00 / planner / existing chat reliability investigation.
- Requested scope: read-only code trace for the chat agent map lookup failure; no implementation or rollout requested.
- Starting repository state: HEAD fba416a with pre-existing documentation changes. Newer worker work remains in its separate managed worktree.
- Work performed / changed files: independent specialist inspected map service, provider authorization, chat duplicate suppression, Calendar/Discord clients, migration028 and focused tests. No files or external data changed by the specialist.
- Decisions: entire map read shares a 60,000ms deadline. Unfiltered reads load every saved event, including ended/cancelled records, then verify originals with at most four concurrent checks. Calendar references repeat account/ACL/event reads. Identical source references share authorization only within one map read. Chat suppresses identical calls even after a failed read; a relevant optimistic-write-conflict refresh is the sole exception.
- Checks and evidence: node --test tests/map-event-read-performance.test.mjs tests/map-failure-diagnostics.test.mjs passed 17 offline cases. These cover bounded concurrency, source reuse, targeted filtering, cancellation and both initial-store/outer-operation timeout paths; they are not live upstream tests.
- Resulting state / acceptance: accept code trace as an explanation of deadline and duplicate behavior. Existing execution/timeout diagnostics cannot distinguish a stalled snapshot fetch from provider verification. Provider fan-out is a leading cause, not a proven single upstream outage.
- Remaining work and handoff: report diagnosis to user. A later bounded repair should measure content-free phase durations and narrow map reads/share repeated request-local access work while preserving source/revocation checks. No repair or deployment performed.
