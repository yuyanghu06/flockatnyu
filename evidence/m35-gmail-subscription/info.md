# M35 Gmail subscription verification

Goal: independently exercise the local Gmail event subscription, durable
incremental checkpointing and shared-cache delivery without live credentials.

- tester-tests.log: final23 new subscription tests plus M34 SQL/worker and
  existing Google tests;71/71 passing after evaluator's page-liveness fix.
- tester-tests-initial-68.log: preserved earlier68/68 acceptance, which missed
  progress across oversized history pages; superseded by the final run.
- tester-page-progress-fixture-adjustment.log: interim20/22 after coder's fix;
  failure expectations still described full-page replay/cleared offset null.
- tester-initial.log: earlier17-test synthetic subscription subset, all passing,
  before metadata-fallback/runtime integration cases were added.
- tester-report.md: exact command, scope, acceptance and unavailable checks.

Local acceptance is complete. Google token/signature verification and HTTP/RPC
responses are mocked; no live Pub/Sub topic, OAuth consent, hosted migration,
email delivery or Railway service is established by these artifacts.

Root final integrated verification is root-integrated-tests.log (107/107),
covering cache SQL, automation, Gmail and shared provider/chat/Google fixtures.
This does not establish live subscription/deployment or hosted migration.

Hosted activation evidence: hosted-migrations.json records exact new receipts and
receipt-only recovery; hosted-evaluator-report.md records independent schema/ACL/
preservation acceptance. deployed-source-hashes.json fingerprints only the
reviewed collector/automation/provider/package files in the secret-free image
context. Live delivery evidence is recorded separately; local tests alone do not
establish it.

Initial live pass: live-tester-report.md/live-tester-checks.json confirm running
health/authentication/watch but repeated callback400 with no accepted signed
push. This is an unresolved live finding; no email-delivery claim follows.

Final numeric compatibility: diagnostic-tests.log now records41/41 (29Gmail+
12Google), and root-final-numeric-tests.log records113/113 integrated passes.
numeric-source-hashes.json fingerprints the final3changedGmailmodules. Live
report/checks retain initial and diagnostic failures and append final revision
79247d6f-c10f-4642-9371-540a3cee14d9 success: health200, unsigned/forged401,
signed notification200 and active watch. Actual new-email cache test is pending;
notification acceptance alone does not establish message hydration/enqueue.

Final live tester/evaluator accept the signed-notification transport and auth
boundaries only. The checkpoint sync timestamp precedes the accepted push, so it
is startup reconciliation evidence, not proof of push-triggered synchronization.
Actual new-email ingestion is still awaiting a new test message.

Final real-email acceptance supersedes the earlier cache-empty limitation:
live-email-test.json and live-email-tester-report.md independently verify exactly
one full correct-source message, deterministic UUID and pending metadata without
payload duplication, ready checkpoint/no lease, and corroborating webhook200.
Receipt time2026-10-17T18:34:20.688488Z. Source bodies/addresses/provider IDs are
excluded from evidence. No LLM/tool actions or cleanup were performed.

Read-only evaluator independently reran the real-email aggregates and accepted
actual Gmail-to-cache ingestion. M35 delivery acceptance is complete; no semantic
extraction, LLM execution or map/Calendar effects are claimed.
