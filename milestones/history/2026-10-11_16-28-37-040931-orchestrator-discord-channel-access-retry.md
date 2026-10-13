# Discord channel access retry

- Local timestamp / acting role / milestone: 2026-10-11T16:28:37.040931-04:00 / orchestrator / M17.
- Requested scope: retry supplied channel1203562091982622814 after user permission changes.
- Starting state: previous live application/guild authenticated, channelGET403; no registered source/history/deployment.
- Work performed / changed files: repeated preflight and direct selected-channel diagnostic; shared journal updated only.
- Decisions: retain selected-channel scope; do not register/archive a denied source. Automatic discovery remains unimplemented.
- Checks and evidence: npm run discord:preflight -- --channel1203562091982622814 exited1 permission_denied. Direct GET/api/v10/channels/1203562091982622814 still HTTP403. Logged endpoint/status only, no token/content.
- Resulting state / acceptance: access remains denied; no backfill/schema/deployment/cron changes.
- Remaining work and handoff: verify the installed bot role's channel/category View Channel access and Read Message History, then retry. No independent specialist or application test rerun for this read-only operational check.
