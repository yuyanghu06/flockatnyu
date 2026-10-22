# Tool reliability follow-up independently verified

- Local timestamp / acting role / milestone: 2026-10-21T17:15:25.302072-04:00 / tester / tool failure diagnostics.
- Requested scope: five-minute Discord summary, backend Calendar pagination, reduced map read overhead; separately save relevant-link behavior.
- Starting state: extensive preexisting and concurrent local work preserved.
- Work performed / decisions / checks: Independent final445/445 integrated regressions pass in11.9seconds, no skips/failures; earlier focused214 and summary48 pass. Twelve new Calendar pagination cases and worker regressions cover stable scope/empty pages/dedup/cursor validation/page-event-UTF8 bounds/cancellation/final ACL revocation, full gap-free coverage, recursive narrowing, conflict refresh and vanished rows. Native26event correction uses one list plus one batchupdate and preserves human fields/fresh revisions. New map8cases verify max4concurrency, read-local dedup, ordering/fresh access and uncached writes. Updated intentional stale assertions and tests/info.md. Evidence: evidence/tool-failure-logging/reliability-followup-445.log. Synthetic providers only; no production latency or deployment claim.
- Changed files: runtime Calendar/worker/map/summary/config and owned tests/guides for implementation; tester owns tests only; evaluator read-only; orchestrator owns serialized docs/evidence/journal.
- Resulting state / acceptance: accepted for local integration.
- Remaining work / handoff: isolated reviewed release and live timing verification; saved relevant-link behavior implementation remains follow-up.
