# Direct chat map save independently verified

- Local timestamp / acting role / milestone: 2026-10-22T15:45:16.800356-04:00 / tester, serialized by orchestrator / chat-map-clarification.
- Requested scope: Verify actual direct-save behavior without original provider evidence.
- Starting repository state: Concurrent staged Calendar pipeline, receipt, draft and concurrency work preserved. User selected saving during chat after routing explanation.
- Work performed / changed files: Added tests/chat-map-activity.test.mjs with 33 cases; retained the single prior assertion correction. Actual runtime factory, legacy/native shared runner, synthetic Supabase HTTP and presence authorizer exercised.
- Decisions: Direct declarations use genuine application-owned provenance; existing provider-backed and autonomous-worker source/identity checks remain independent. Unknown or insufficient facts do not save.
- Checks and evidence: 207 focused checks passed, zero failures/skips. Tests verify unknown/name-only clarification, original clock and session isolation, exact Discord/fallback names, fixed targets, insufficient/conflicting facts, intent fences, replay/revocation/conflicts and production map projection. Stateless save and anonymous chat return403. No live endpoints/model calls.
- Resulting state / acceptance: Independent local PASS; direct reports save and surface through actual runtime read path.
- Remaining work and handoff: Live model wording and hosted/browser verification not performed. Pending name context is process-local for ten minutes; unsupported timing/place clarifications request a complete fresh report.
