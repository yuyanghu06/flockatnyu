# Spotlight late cancellation guard fixed

- Local timestamp / acting role / milestone: 2026-10-23T19:28:04.696608-04:00 / coder reported to orchestrator / spotlight-steering.
- Requested scope: user-requested controls and genuine queue-arrow active input.
- Starting repository state: HEAD04864bf plus scoped implementation; other chats' changes preserved.
- Work performed / changed files: Evaluator reproduced acceptinput during held tool_started audit, abort and finish run, then release audit causing a late applied acknowledgement. Parent added abort checks after awaited audit and before draining input; finished registry refuses drain/applied and clears/wakes pending state. Exactly2 of23 model-pinned files changed after the model gate, solely these defensive guards. Tester added exact late-audit regression: zero post-terminal stream/model/tool effects, zero adapter dispatch, closed run409. No normal-path prompt/provider/model/protocol change; no inference repeated.
- Decisions: retain first action receipts, exact versions, unknown-write/create guards and existing permissions/budgets/deadline. No cross-service hidden operations.
- Checks and evidence: see docs/spotlight-steering-verification-2026-10-23.md and ignored evidence/spotlight-steering-2026-10-23/.
- Resulting state / acceptance: local source and independent evaluation accepted; not yet a hosted outcome.
- Remaining work and handoff: logical source commit/push, source-only web package, authorized deployment and read-only hosted health/auth/assets/steering-route checks. No worker rollout or business-data test.
