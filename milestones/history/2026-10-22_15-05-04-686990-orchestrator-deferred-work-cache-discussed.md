# Deferred-work cache feasibility discussed

- Local timestamp / acting role / milestone: 2026-10-22T15:05:04.686990-04:00 / orchestrator / design discussion.
- Requested scope: Assess a compact UUID/JSON cache with timestamps for agent follow-up on unsuccessful event work.
- Starting repository state: Concurrent work preserved; Calendar API sync remains a proposal.
- Work performed / changed files: Inspected automation store/updater and documented retry contract. Only journal files changed by this pass.
- Decisions: Existing agent_input_cache already uses UUID/JSON with separate service-only retry metadata. A proposed temporary deferred-task record would reference original evidence and dependencies; a summary would be a navigation hint, never source authority. Waiting for Calendar projection should be distinguished from repeated execution failures. No schema/runtime implementation or rollout authorized by this discussion.
- Checks and evidence: Source inspection only; current store exposes scoped claim, fail, finish and service-only requeue. Existing retry policy has five-minute deferral and bounded failure quarantine. No tests, model calls, source reads or deployment performed.
- Resulting state / acceptance: Feasibility explanation ready; no implementation selected.
- Remaining work and handoff: User decision on Calendar sync/deferred-work design; existing active work unchanged.
