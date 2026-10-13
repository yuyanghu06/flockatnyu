# M20 calendar runner and name context

- Local timestamp / acting role / milestone: 2026-10-11T19:13:44.178916-04:00 / coder / M20.
- Requested scope: Per-channel calendar retention/names and authorized Railway summaries.
- Starting repository state:006 unapplied, originals intact; calendar tests/review active.
- Work performed / changed files: Scheduler uses DST-aware current NY Monday00 cutoff; runner passes channelName/channelId/sourceId, promptversion discord-calendar-retention-v3.
- Decisions: Preserve current NY calendar week, independent daily collector, private server credentials; no embeddings/images/automatic context.
- Checks and evidence: 46runner/provider checks plus5calendar/name fixtures passed. Two obsolete schedule assertions assigned to tester; crossmonth SQL pending independent verification. Evidence:evidence/m20-discord-summaries/calendar-runner-coder-report.md.
- Resulting state / acceptance: Assigned bounded pass complete, final local/hosted retention acceptance pending.
- Remaining work and handoff: Final SQL/tests/evaluator, apply006, hosted timing, actual pilot/history, deploy accepted context and enable summary cron.
