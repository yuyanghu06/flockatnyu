# discord launch local acceptance

- Local timestamp / acting role / milestone: 2026-10-11T16:08:45.258022-04:00 / tester / M17.
- Requested scope: new Discord Railway archive service, initial full-history local backfill, then scheduled Railway handoff.
- Starting state: M16 local archive accepted, M17 plan/review accepted; existing user changes preserved.
- Work performed / changed files: Independent tester owns tests/discord-launch.test.mjs and evidence/m17-discord-launch plus tests guide. Verified pre2026 full originals, epoch cutoff, permission/content/operator denials, checkpoints/resume/catch-up/idempotency, error redaction, strict exits/SIGTERM and isolated deploy allowlist/symlink rejection.
- Decisions: exact channel/thread scope; no blanket reader permissions; existing memory-summary backlog preserved. Initial full history collected locally before scheduled handoff. Migration history version mapping documented; do not replay future-prefixed local files with db push.
- Checks and evidence: Integrated98/98 tests passed, zero failures/skips;23new launch/deploy checks; API build exit0. Docker CLI28.3.3 present but daemon unavailable, so actual container build unverified. See evidence/m17-discord-launch/tester-report.md.
- Resulting state / acceptance: local implementation accepted for final independent review, hosted storage/service preparation observed; full live launch incomplete.
- Remaining work and handoff: bot creation/invite, guild/channels/threads and local secret setup; runtime PostgREST preflight, actual local full backfill/counts/watermarks, secure Railway variables, isolated deployment and successful job then daily cron. No application container run/live history claimed.
