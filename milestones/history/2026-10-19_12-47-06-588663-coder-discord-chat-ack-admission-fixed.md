# Pending ACK admission fixed

- Local timestamp / acting role / milestone: 2026-10-19T12:47:06.588663-04:00 / coder / discord-chat.
- Requested scope: approved Discord eboard interactions plus trusted triggering-user context; no indexing.
- Starting repository state: planned independent implementation with exclusive runner/transport ownership; preexisting production/user changes preserved.
- Work performed / changed files: Independent evaluator reproduced unbounded slow slash ACK allocation. Transport now reserves global/member slots before network/controller allocation and protects active IDs from dedup cache eviction. Two targeted cases added;34focusedchecks passed. Overloaded slash invocations may time out rather than allocate rejection work.
- Decisions: source/identity/retention and current model-audit boundaries preserved; no raw prompt/source logging or new persistent chat archive. Details in docs/discord-chat.md.
- Checks and evidence: actual commands and counts from specialist reports and parent runs; synthetic fixtures only. No claim of hosted interaction acceptance. Broad package test discrepancy is tracked rather than hidden.
- Resulting state / acceptance: local implementation ready for remaining independent bridge/access/Gateway verification and final integration review.
- Remaining work and handoff: finish independent tests, precise package allowlist update, bounded source/secret-scanned deployment, command registration and hosted metadata verification.
