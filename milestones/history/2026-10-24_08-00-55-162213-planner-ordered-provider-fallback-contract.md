# Ordered provider fallback contract accepted

- Local timestamp / acting role / milestone: 2026-10-24_08-00-55-162213 America/New_York; planner; provider fallback.
- Requested scope: user wants an environment list of provider links and API keys, with routing to second/third providers.
- Starting repository state: codex/dev f8a4105, shared provider has three operations and legacy one-provider configuration. Existing unrelated local docs/setup work preserved.
- Work performed / changed files: independent planner read provider/config/retry/audit code and supplied contract; no planner edits. Root serializes brief in milestones/provider-fallback/info.md and this immutable entry.
- Decisions: ordered1–8entryJSONlist, explicit per-entry URL/key and optional inherited protocol/model; malformednonblank failclosed; absentblank legacy. Native protocol perentry, one existing timeout acrosschain, pre-HTTPsuccess dispatch failure only. Skip known quota/auth rejection immediately; bounded transientretry thennext. No post2xx/parser/stream replay or fallback on audit/abort/localvalidation.
- Checks and evidence: tester prechange provider/audit/failure/backend gate92/92pass; planner identified nestedJSONlist secret extraction requirement. Everyattempt must audit actualprovider/model/host with sharedrun/context.
- Resulting state / acceptance: contract accepted; runtimecoder and independenttester receive exclusive ownership. Root owns environmentdocs/privateconfig/journal/integration. No new credentials, caps/timeouts/prompts/businessworkflow changes selected.
- Remaining work and handoff: implement/test/evaluate; actual secondaryprovider credentials absent, so futurelivefallback requires privateconfiguration. Provider-global pause, message quarantine recovery and saved-history size correction remain separate.
