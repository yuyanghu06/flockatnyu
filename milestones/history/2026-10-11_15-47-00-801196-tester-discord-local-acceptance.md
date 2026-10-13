# Discord local acceptance

- Timestamp / role / milestone: 2026-10-11T15:47:00.801196-04:00 / tester / M16.
- Scope: local Discord archive, admin and assistant retrieval implementation.
- Work/evidence/state: Independent tester wrote six Discord suites and Chrome admin checks. Integrated command node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs passed 75/75 with zero failures/skips. node tests/discord-admin-browser.mjs passed five real Chrome fixture checks with desktop/mobile/denied captures. Actual embedded PostgreSQL/pgvector migration and RPC role tests passed. Fixed and retested mode mismatch, extension schema grants and null vector provenance. Evidence: evidence/m16-discord-archive/tester-report.md and test-output.txt/browser-results.json. No live source/model/hosted DB or deployment.
- Decisions: original JSONB records remain authoritative; text/date/author search default, vectors optional; summaries retain originals when later implemented.
- Handoff: live launch needs selected guild/channels, runtime credentials, hosted migration verification and real member/channel access policy.
