# M36 hosted cutover and resumable shutdown

- Local timestamp / acting role / milestone: 2026-10-17_14-51-52-314455 America/New_York / orchestrator / M36.
- Requested scope: slim independent collectors, no Discord archive, preserve blacklist and access boundaries.
- Starting state: M36 local cleanup in progress; earlier scope/pass entries are linked in the rolling snapshot.
- Work performed / checks: Applied020 via project-restricted Management API with receipt20261017184647 and HTTP200. Verified unchanged5tables/ACLs, sourceUUIDs, policy/unrelateddata and unaffectedfunctions. Renamed old service discord-events and replaced cron with continuous listener; Gmail independently deployed slim package; both share expectedSupabase. Initial Discordrevision381fc0f6 logged4native creates and Gmail queue1actualmail. Corrected SDK shutdown to resumable4200;62focused checks pass; final Discordrevisionda944452 and Gmail1f4d4571 SUCCESS with Gatewayresume observed. Controlled restart verification and finaldocs pending.
- Decisions: no prompt/memory schema or agent service was added. Google collector flag redesign deferred. Applied SQL/history and Miro preserved.
- Resulting state: pass recorded; see evidence/m36-collector-cleanup for actual outcomes and limits.
- Remaining work: final operational evidence/documentation and live edit/delete/blacklist acceptance; no fabricated native test claims.
