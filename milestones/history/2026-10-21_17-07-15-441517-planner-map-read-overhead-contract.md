# Map read overhead contract

- Local timestamp / acting role / milestone: 2026-10-21T17:07:15.441517-04:00 / planner / tool failure diagnostics.
- Requested scope: five-minute broad Discord scan, backend Calendar pagination and reduced map read overhead.
- Starting repository state: existing extensive local changes and unrelated concurrent work preserved.
- Work performed / decisions / evidence: Read-only planner confirms agent reads sequentially revalidate every event/participant while browser reads already offer scoped original deduplication and concurrency four. Implement that existing per-read scope, bounded workers, stable ordering and relationship indexes; no cross-call caching and no change to uncached two-pass writes. Baseline event/source-access tests pass23/23. Implementation assigned independently; Calendar adapter ownership remains separate.
- Resulting state / acceptance: planning complete, implementation pending.
- Remaining work and handoff: bounded implementation, independent tests and review; no live writes or deployment.
