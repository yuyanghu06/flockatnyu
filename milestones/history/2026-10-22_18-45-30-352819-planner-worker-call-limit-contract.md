# Worker call limit increase planned

- Local timestamp / acting role / milestone: 2026-10-22T18:45:30.352819-04:00 / planner report integrated by orchestrator / worker-call-limits.
- Requested scope: user selected16calls per reply and64per stage, then requested deployment notification.
- Starting repository state: worker1c33c414 live with plain cache/tool-error changes; concurrent test cleanup and live #flock-test verification preserved.
- Work performed / changed files: read-only planner inspected worker config/handler/prompt/provider/history and progress/manual/audit counters. Parent reviewed current files and Railway variable names; explicit MAX_CALLS and MAX_FOLLOWUP_CALLS exist and need64each. No setting/deployment changes yet.
- Decisions: worker passes trusted maxToolCalls16; shared provider default8 remains for chat, applies selected limit to both response parsing and replayed history. Worker stage defaults/max64 and followup fallback64; no round/timeout/token/schema/security changes. Keep attempted-call accounting; progress bound144staged/80legacy accommodates a rejected overflow reply, event bound320 sufficient for normal128calls/26rounds. Provider audit/manual result limits already fit. Parent owns shared docs/example/env/release; coder owns automation config/handler/prompt and provider source/guides; tester owns focused call-limit and specified automation tests.
- Checks and evidence: source inspection found all reply8 and stage32 blockers; no tests or inference calls by planner. Railway variables read exposes names only, no secrets printed.
- Resulting state / acceptance: bounded plan accepted; implementation and independent behavior verification underway.
- Remaining work and handoff: test16/17 response/history for both protocols, defaultchat8,64/65stages/reset/progress, existing cache/failure/control behavior; update worker env64s skipDeploys, upload reviewed package and verify startup.
