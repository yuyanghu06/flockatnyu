# Update Agent Calendar Independent Tests

- Local timestamp / acting role / milestone: 2026-10-17T15:35:04.159055-04:00 / Independent tester calendar_runtime_test integrated by orchestrator / update-agent-calendar.
- Requested scope: Fresh Miro reads and fixed-target Calendar updates each processing batch, proper tools/prompt and live management-access check.
- Starting repository state: Prior cadence/status work and unrelated asset changes present; exclusive ownership preserved.
- Work performed / changed files: Added only tests/calendar-tools.test.mjs and tests/update-agent-calendar.test.mjs. Primary updated tests/info.md and standard test command to retain these regressions.
- Decisions: Eligible batch, not idle poll; provenance and calendar target backend-owned. No attendees, recurrence, arbitrary deletes or source writes. Existing applied SQL preserved.
- Checks and evidence: New suites25/25 PASS; existing automation79/79 PASS; Google/Miro55/55 PASS; API build PASS. Fixed-target scope/account/ACL and revocation, deterministic idempotency/409/lost replies, human-edit/412 preservation, dates, managed cancellation, ready-batch preparation/failed cleanup, fresh item evidence, partial/empty source status,37frames and lossless UTF8fragments verified with synthetic transports.
- Resulting state / acceptance: Independent local behavior PASS. No real Calendar writes, live model behavior or hosted deployment verified by tests.
- Remaining work and handoff: Owner sharing, exact-target writer/owner recheck, then runtime operational verification. Existing update agent remains disabled/undeployed. Full large-board scan and map/memory tools remain outside this bounded implementation.
