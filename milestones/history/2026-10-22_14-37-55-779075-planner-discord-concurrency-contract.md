# Discord concurrency contract

- Local timestamp / acting role / milestone: 2026-10-22T14:37:55.779075-04:00 / planner (independent concurrency_plan agent) / discord-concurrency.
- Requested scope: raise live total concurrency to10 and per-member to5.
- Starting repository state: prior blacklist work already deployed; unrelated uncommitted files preserved. Live CLI selected-variable reads confirm enabled chat and no explicit concurrency overrides on web/discord-events. Railway MCP unauthorized; CLI authenticated.
- Work performed / changed files: planner read-only inspection of config/adapter/bridge; parent journal only.
- Decisions: preserve fallback3/1; change per-member upper bound2→5, configure10/5 on both live services and deploy matching source. Counters support five already. Existing same-member/destination concurrent requests use request-start history snapshots; last completion replaces that RAM history (document, no history redesign). Preserve hourly cap, pacing, source policy, cancellation and destination routing.
- Checks and evidence: static inspection plus selected production variable read; no source/model calls.
- Resulting state / acceptance: bounded contract accepted; implementation/testing/review/release remain.
- Remaining work and handoff: coder owns config and two docs/example; tester owns config/adapter tests; parent journals and releases.
