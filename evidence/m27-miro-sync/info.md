# M27 independent verification

This folder records local independent tests of the Miro ingestion worker,
migration 012, deployment context and live assistant tools. See
[tester-report.md](tester-report.md) for commands, results and coverage limits.
The original tester report uses offline API/provider fixtures. Later root rollout
and connection receipts record actual hosted configuration and protected live API
checks; these are distinguished from independent fixture tests. Evidence never
contains credentials or raw board bodies, and connection setup used no model calls.

The tests live in `tests/miro-*.test.mjs`; run them with
`node --test tests/miro-*.test.mjs` from the repository root. Their SQL checks execute
the real knowledge migration 001 followed directly by 012 in in-memory PGlite.

Local verification passed. Deployment and real-board acceptance remain the
orchestrator's responsibility and are not established by this evidence.

Root rollout receipts: hosted-schema.json records applied012 and table/grant readback; railway-deployment.json records successful isolated image, schedule/settings, reviewedworkerhashes and explicit pending source authorization. railway-readback.json captures safe configuration fields. Root final82combinedtests/APIvalidation pass; local HTTP ports3001/5173 expose4Mirotools. No actualboard/modelcall or croninvocation verified.

apply-readback.json records fresh apply-follow-up verification: migration/service already applied, Miro token and board scope still absent. No duplicate migration or external mutation.

October17 connection-live-tools.json records eight real protected local HTTP
observations, including metadata-only native table handling and expected403 for
an unconfigured board. Its harness note corrects the generic response.ok assertion
for that expected denial. Current startup/authorization/snapshot acceptance belongs
in the rolling milestone; earlier token-missing receipts remain historical.

connection-groups-diagnostic.json records actual Node22.12 structural reads:41canonical groups,2raw group pages,71member objects and41membership pages. It writes no snapshot and contains no raw board bodies.
