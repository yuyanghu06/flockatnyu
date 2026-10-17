# Miro initial capture runtime contingency

- Local timestamp / acting role / milestone: 2026-10-17_13-47-20-360692; planner miro_connection_plan; M27 activation.
- Requested scope: read-only contingency for a large board approaching default20minute capture budget.
- Starting repository state: first serial capture still running with renewed lease; real live tools pass; no initial snapshot published.
- Work performed / changed files: planner inspected existing config/client/snapshot/sync/tests; no edits or network calls. Root separately listed all2495API rows without logging bodies:37frames,69texts,30tables,1302table_text,1image,1056sticky_notes.
- Decisions: wait for actual run outcome. If deadline fails, existing MIRO_MAX_RUN_MS up to3600000 is smallest reversible retry; preserve every other budget and wait for cleanup/lease release first. No concurrency change is implemented. A possible later pool would require at most4requests, stable ordering, aggregate budgets, abort-and-drain before cleanup, and single-flight lease renewal in sync.js; it is not a trivial snapshot-only change.
- Checks and evidence: supplied real runtime/lease observations; read-only code review only, no new planner tests. Root API inventory50pages counts only; initial capture remains in progress.
- Resulting state / acceptance: contingency accepted without new implementation scope. Existing native table limitations and permissions unchanged.
- Remaining work and handoff: root waits for capture outcome, then records actual publication or safely retries if necessary. Hosted daily enablement follows successful verification.
