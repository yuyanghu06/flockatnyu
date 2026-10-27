# Raw-only v2 worker implemented

- Local timestamp / acting role / milestone: 2026-10-26_19-06-51-193995 / coder / gmail-cache-enrichment.
- Requested scope: raw sender cache -> Treg -> native Contacts only; user then requested daily9AMET and confirmed NewYork with daylight saving.
- Starting state: prior local cache-backwrite implementation was unapplied and superseded; existing sender intake and other project work preserved.
- Work performed/changed files: Worker/store/CLI now use only v2 probe/claim/renew/complete/defer RPCs. Removed cache backwrites, full-response persistence, cached-snapshot resume and the separate Contacts writer. Every pending job looks up its address, then sends only native hit data to atomic completion; exact typed receipts gate success.
- Checks/evidence: Syntax, disabled CLI and isolated 17-file package passed before the later scheduler wrapper. Prior v1 tests were not reused as proof of this correction.
- Decisions: cache inputs never changed/deleted, processing payloads not retained in job state, safe existing Contact preservation, fixed operational scope and monetary reservations, no continuous polling in production.
- Resulting state/acceptance: corresponding pass accepted; final current truth is in rolling snapshot.
- Remaining work/handoff: natural first9AMprovider execution, actual upstream token authentication/results and multi-session production lock contention remain unverified. Never copy real tokens/log payloads into committed evidence.
