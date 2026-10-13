# M20 calendar source catch up and attribution integration

- Local timestamp / acting role / milestone: 2026-10-11T19:17:25.267409-04:00 / orchestrator / M20.
- Requested scope: Per-channel/current-calendar-week RAG retention with channel names/IDs.
- Starting repository state: Prior rolling-window policy superseded,006 unapplied,108836 originals intact.
- Work performed / changed files: Found and requested recurring old-source catch-up beyond immediately previous month; storage fix landed. Added supplied-speaker attribution instruction to Luna provider; private bounded stage-before-commit pilot helper prepared outside repo.
- Decisions: Preserve current-week raw across month boundary; ordinary schedules catch up auto-discovered old history. Speaker attribution remains evidence-bound, original links preserved.
- Checks and evidence: 20/20provider checks and private helper syntax passed. Tester reports16calendarSQL/54pure checks passing; largest publication/fullintegration ongoing. No actual summary/model/prune or006apply. See server/discord/summary-provider.js.
- Resulting state / acceptance: Bounded implementation/integration complete; independent final acceptance pending.
- Remaining work and handoff: Final fullscale/evaluator, hosted006/preview/pilot/history, accepted Railway image/cron.
