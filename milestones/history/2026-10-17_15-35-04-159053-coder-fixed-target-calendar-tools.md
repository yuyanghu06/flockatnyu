# Fixed Target Calendar Tools

- Local timestamp / acting role / milestone: 2026-10-17T15:35:04.159053-04:00 / Calendar coder calendar_tools integrated by orchestrator / update-agent-calendar.
- Requested scope: Fresh Miro reads and fixed-target Calendar updates each processing batch, proper tools/prompt and live management-access check.
- Starting repository state: Prior cadence/status work and unrelated asset changes present; exclusive ownership preserved.
- Work performed / changed files: Implemented fixed-target Google Calendar client/config and four executable tools; optional --calendar consent and optional required-scope verification preserve readonly defaults. Owned seven files: server/google/calendar-config.js, calendar-client.js, config.js, oauth.js, tools/calendar/index.js, info.md and scripts/google-connect.mjs.
- Decisions: Eligible batch, not idle poll; provenance and calendar target backend-owned. No attendees, recurrence, arbitrary deletes or source writes. Existing applied SQL preserved.
- Checks and evidence: Syntax/scoped whitespace PASS; existing Google connector12/12 PASS; inline restricted schema/date/target/zero-network checks PASS. Deterministic source IDs, private managed hash/ownership, current account/scopes/target ACL checks, ETags and lost-response/409 reconciliation inspected by primary. No live writes by coder.
- Resulting state / acceptance: Local code accepted; target grant/live verification belongs to primary. Sparse cancellation tombstones fail closed rather than claim success.
- Remaining work and handoff: Owner sharing, exact-target writer/owner recheck, then runtime operational verification. Existing update agent remains disabled/undeployed. Full large-board scan and map/memory tools remain outside this bounded implementation.
