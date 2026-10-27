# Raw-only storage independently verified

- Local timestamp / acting role / milestone: 2026-10-26_19-06-51-194610 / tester / gmail-cache-enrichment.
- Requested scope: raw sender cache -> Treg -> native Contacts only; user then requested daily9AMET and confirmed NewYork with daylight saving.
- Starting state: prior local cache-backwrite implementation was unapplied and superseded; existing sender intake and other project work preserved.
- Work performed/changed files: Tester captured a genuine failure against old v1 cache mutation, then tested revised actual SQL/production adapters. A statement trigger rejects every cache INSERT/UPDATE/DELETE while the successful runtime still completes; whole-row text/timestamps remain exact.
- Checks/evidence: 31 focused checks pass; evidence evidence/gmail-enrichment/raw-only/. Verified metadata-only jobs, atomic rollback, precommit same-request retries, postcommit lost-reply no lookup, human edits, sources/leases/budgets/quarantine. One-connection local SQL does not establish live multi-session lock contention.
- Decisions: cache inputs never changed/deleted, processing payloads not retained in job state, safe existing Contact preservation, fixed operational scope and monetary reservations, no continuous polling in production.
- Resulting state/acceptance: corresponding pass accepted; final current truth is in rolling snapshot.
- Remaining work/handoff: natural first9AMprovider execution, actual upstream token authentication/results and multi-session production lock contention remain unverified. Never copy real tokens/log payloads into committed evidence.
