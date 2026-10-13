# discord launch cli implemented

- Local timestamp / acting role / milestone: 2026-10-11T16:08:45.257711-04:00 / coder / M17.
- Requested scope: new Discord Railway archive service, initial full-history local backfill, then scheduled Railway handoff.
- Starting state: M16 local archive accepted, M17 plan/review accepted; existing user changes preserved.
- Work performed / changed files: Coder implemented preflight/register/backfill/sync in server/discord/cli.js, extended client.js current-application/guild lookups, updated folder guide. Explicit IDs/operator checks, Message Content capability and effective history permission validation; register full history from2015 without automatic grants; fixed-target bounded replay proves saved checkpoint progress and stops stall/error/abort. Strict runtime nonzero for missing config; generic worker unchanged.
- Decisions: exact channel/thread scope; no blanket reader permissions; existing memory-summary backlog preserved. Initial full history collected locally before scheduled handoff. Migration history version mapping documented; do not replay future-prefixed local files with db push.
- Checks and evidence: node --check CLI passed; targeted launch/client/sync33/33 reported, sanitized missing-config/token-argument exits1; 210-message fixture3runs correct fixed watermark. No coder cloud/Discord/model calls.
- Resulting state / acceptance: local implementation accepted for final independent review, hosted storage/service preparation observed; full live launch incomplete.
- Remaining work and handoff: bot creation/invite, guild/channels/threads and local secret setup; runtime PostgREST preflight, actual local full backfill/counts/watermarks, secure Railway variables, isolated deployment and successful job then daily cron. No application container run/live history claimed.
