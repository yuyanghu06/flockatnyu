# mixed-prompt-assertions-trimmed

- Local timestamp / acting role / milestone: 2026-10-22T19:11:06.682631-04:00 / orchestrator / test-phaseout.
- Requested scope: User said go on current-rule overlap review and phase-out; historical SQL preserved.
- Starting repository state: Prior cleanup complete, separate attendance/prompt work concurrent and preserved.
- Work performed / changed files: Removed phrase-only assertions from two mixed tests while preserving real escaped-label serialization in both prompt phases and supported/invalid followup configuration behavior. No individual cases removed or production prompt changed.
- Decisions: Remove only evidence-backed duplication/text checks, never meet an arbitrary quota by dropping current behavior.
- Checks and evidence: node --test tests/chat-request-context.test.mjs tests/agent-staged-handler.test.mjs:21pass,0fail/skip; scoped whitespace passed.
- Resulting state / acceptance: Bounded pass accepted; phase-out implementation remains underway.
- Remaining work and handoff: Finish 28-case prompt/catalogue/fallback cleanup and independent current-source checks/inventory/evaluation. No application, source, migration, deployment or model changes by this work.
