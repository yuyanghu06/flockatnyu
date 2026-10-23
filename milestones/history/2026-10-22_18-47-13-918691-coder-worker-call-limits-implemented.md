# Worker16reply/64stage limits implemented and frozen

- Local timestamp / acting role / milestone: 2026-10-22T18:47:13.918691-04:00 / coder report integrated by orchestrator / worker-call-limits.
- Requested scope: selected16tool calls per reply and64per worker stage, preserving shared chat limits.
- Starting repository state: accepted plan, concurrent test cleanup/live verification preserved.
- Work performed / changed files: coder changed worker config/handler/prompt and automation guide plus provider parser/guide. Shared provider trusted maxToolCalls option defaults8/range1..16 and covers both history/new responses without entering HTTP body; worker uses16. Config defaults/max64 and handler fallback64; stage counters reset independently. Prompt16/64. Existing attempted counts retained; progress bound144/80 and320events. Parent updatedAGENTS/notes/envexample/shared docs.
- Decisions: no model-round/timeout/token/schema/auth/cache/error changes. Chat planning remains8. Explicit live worker settings32each confirmed privately by CLI, not yet changed.
- Checks and evidence: coder existing provider/safety/cache/runtime regressions pass; four stale32/128test assertions assigned to tester. Coder and parent API build pass. Parent58-file sanitized package pLmiTf matches53sourcefiles, syntax pass; onlyconfig/handler/prompt/providers differ from deployed1c33c414. Metadata /tmp/worker-call-limits-release.json. No source changes after freeze.
- Resulting state / acceptance: runtime ready for independent behavior tests/review; no deployment/env writes yet.
- Remaining work and handoff: final16/17and64/65protocol/history/reset checks, reviewerACCEPT, live worker env64s skipDeploys, deploy exactpackage and verify startup/settings.
