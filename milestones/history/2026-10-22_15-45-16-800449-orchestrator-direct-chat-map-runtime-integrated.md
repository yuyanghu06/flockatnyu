# Direct chat map runtime integrated

- Local timestamp / acting role / milestone: 2026-10-22T15:45:16.800449-04:00 / orchestrator, serialized by orchestrator / chat-map-clarification.
- Requested scope: Integrate immediate direct save and shared prompts while preserving worker authorization.
- Starting repository state: Concurrent staged Calendar pipeline, receipt, draft and concurrency work preserved. User selected saving during chat after routing explanation.
- Work performed / changed files: Parent edited server/runtime-app.js, server/assistant-context.js, server/chat-request-context.js, server/site-auth.js, server/tool-diagnostics.js, tests/site-auth.test.mjs, AGENTS.md and affected prompt/events/folder guides. Site session HMAC is internal, not a credential or model prompt field. Runtime grants declaration capability to authenticated map calls only; result targets and applied receipts reach both provider protocols.
- Decisions: Direct declarations use genuine application-owned provenance; existing provider-backed and autonomous-worker source/identity checks remain independent. Unknown or insufficient facts do not save.
- Checks and evidence: Broad relevant twenty-suite Node regression command passed; npm run build:api verified syntax/runtime dependencies; whole-tree git diff --check passed. Earlier29auth/request/prompt checks passed after preserving truthful generic-source prompt assertion. No model calls, hosted writes, deployment or commits.
- Resulting state / acceptance: Runtime integrated locally with independent tester PASS; final read-only evaluator verdict pending. Existing unrelated working tree preserved.
- Remaining work and handoff: Finish final evaluation and local documentation receipt. Do not claim live deployment or browser appearance verification.
