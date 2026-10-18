# Event two hour policy

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664239-04:00 / coder / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Apply user instruction: default event lengths to two hours.
- Starting repository state: Presence freshness policy implemented; event duration default required separate approval.
- Work performed / changed files: Added immutable EVENT_DEFAULT_POLICY and 7200-second duration constant; updated event schema descriptions, examples and Calendar/map prompt wording.
- Decisions: Only supported timed start with missing end/duration defaults to start+7200seconds. Preserve explicit durations/ends and known ends on partial edits. All-day exclusive date boundaries and unknown starts are excluded.
- Checks and evidence: Both policies included in206/206 independent combined regressions and final32/32 focused checks.
- Resulting state / acceptance: Approved event-duration policy wired locally, without automatic DB defaults or event-write privileges.
- Remaining work and handoff: Resolve review wording and complete independent acceptance.
