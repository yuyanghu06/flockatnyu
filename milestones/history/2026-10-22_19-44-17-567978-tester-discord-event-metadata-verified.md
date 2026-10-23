# Independent Discord event metadata behavior verified

- Local timestamp / acting role / milestone: 2026-10-22T19:44:17.567978-04:00 / tester / live-planner-calendar-tests.
- Requested scope: independently verify new-channel publication/ingestion without archive blocking; preserve real failure/replay/access behavior.
- Starting state: frozen runtime and migration044; no hosted changes. Root inspected actual new test integration and current hashes.
- Work performed / changed files: tests/discord-event-metadata.test.mjs plus focused additions in tests/discord-events.test.mjs; application/old migrations unchanged.
- Decisions: actual local PGlite44-migration database, production stores and queue, actual discovery held at archive endpoint, real Gateway events. Test confirms channel publication, native original and checkpoints complete before archive release; old scan fails and new full scanner completes retaining UUID. Additional tests cover unknown source fallback, replay after checkpoint failure, no checkpoint on metadata failures, real REST private permission/malformed checks, deletion/reparent descendant withdrawal and manual/policy/CAS/ACL behavior. No history reads.
- Checks/evidence: node --test tests/discord-event-metadata.test.mjs tests/discord-events.test.mjs tests/discord-metadata-refresh.test.mjs tests/discord-discovery.test.mjs tests/discord-live-publication.test.mjs —80 reported checks,0failures,exit0,15.98s. Scoped whitespace passes. First test-only frozen-object assignment issue corrected before stable rerun; no app finding. Migration SHA2560c0308e749f4cf6282da5ce7792ab1d1d140277b0db2fb9dd50362289313c9ed.
- Resulting state / acceptance: independent local testing passes; live source, hosted DDL and rollout remain unverified. Sanitized26-module package byte-matches current source.
- Remaining work and handoff: final evaluator decision, apply migration via MCP and deploy collector, native live verification, Calendar/map scenarios and exact final cleanup.
