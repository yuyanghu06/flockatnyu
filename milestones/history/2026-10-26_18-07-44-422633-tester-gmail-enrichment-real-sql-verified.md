# Separate enrichment actual SQL and runtime verified

- Local timestamp / acting role / milestone: 2026-10-26_18-07-44-422633 / tester / gmail-cache-enrichment.
- Requested scope: separate Gmail cache -> Treg -> same enriched cache -> raw Contacts service.
- Starting state: independent bounded plan; actual sender cache049 supplied by a concurrent intake task.
- Work performed / changed files: Independent tester loaded actual047/049/050 in PGlite and bridged production PostgREST adapter calls to real local functions, with only Treg HTTP simulated. Verified private grants/RLS, global claims, source/state fences, cache-before-contact ordering, exact native raw data, large responses, crash recovery/human edits, unknown-charge replay budgets, UTC rollover, quarantine/backoff, unsupported cases and zero-paid cached completion at cap.
- Decisions: no Gmail body fetch/transmission or LLM, raw native data preserved, existing records insert-only, explicit private logs, durable leases/versions/budgets, no cache deletion. Configured source/account is operational scope rather than invented per-row provenance.
- Checks and evidence: 32 focused checks pass in 6.41 seconds: nine actual SQL groups, nine engine/client groups and fourteen prior Treg/logging groups. Evidence evidence/gmail-enrichment/sql/independent-tests.tap and verified-source-sha256.txt. PGlite uses one connection; true multi-session PostgreSQL lock contention is not claimed. Earlier broader run retains one unrelated concurrent Contacts fuzzy assertion failure; no unrelated tests edited.
- Resulting state / acceptance: local implementation stages accepted and integrated; final overall verdict is local ACCEPT only.
- Remaining work/handoff: reviewed050 application and separate runtime activation/hosted verification remain pending. Never print tokens or copy real logs into committed evidence.
