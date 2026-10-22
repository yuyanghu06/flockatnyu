# Harness reliability implementation contract

- Local timestamp / acting role / milestone: 2026-10-21T12:48:36.768444-04:00 / planner / harness reliability.
- Requested scope: implement the recommended retry/quarantine improvement.
- Starting state: clean9a4b037; earlier chat-budget/collector releases are committed and Railway-paused.
- Work performed: independent planner inspected provider/automation/audit/migrations and confirmed installed PGlite availability. Parent froze contracts and assigned disjoint provider/queue coders and independent tester.
- Decisions: User authorized implementation of the first reliability recommendation. Provider retries: at most three HTTP attempts within one original deadline, transient transport/status classification, one durable audit per attempt, no retries after successful response processing. Queue: five failed attempts, isolated singleton retries, fair fresh/retry lanes, fixed outcome metadata, fenced recovery,24-hour quarantine payload expiry and service-only scoped requeue. Earlier planner suggestions of six failures/seven days were not adopted. Search/channel queues remain separate follow-ups.
- Checks and evidence: read-only source inspection, git status/log, Nodev25.8.0, installed PGlite/pgvector resolution. No runtime tests or hosted writes in planning pass.
- Changed files: journal/folder guides only in this pass; implementations underway in exclusive assigned files.
- Resulting state / acceptance: plan accepted. Migration036 reserved; preserve001-035 and historical tests. Parent owns shared docs/journal.
- Remaining work: implementation, independent deterministic provider and real SQL tests, read-only review, regressions/build and integration. No source/model calls required. Live deployment and migration application not claimed.
