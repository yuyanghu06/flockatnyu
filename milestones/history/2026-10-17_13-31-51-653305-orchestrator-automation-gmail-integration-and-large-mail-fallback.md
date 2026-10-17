# M34/M35 root integration

- Local timestamp / acting role / milestone: 2026-10-17_13-31-51-653305; orchestrator; M34/M35 root integration.
- Requested scope: complete cache worker/event updater, subscribe to emails for techflock, then notify user before prompting work.
- Starting repository state: M33 local accepted, M34/M35 parallel implementation with exclusive ownership; extensive unrelated dirty work preserved.
- Work performed / changed files: Root added package scripts, opt-in .env.example settings, docs/agent-automation.md, server/Supabase/docs/deployment folder guides and deployment/gmail-events Dockerfile. Added bounded full-message-too-large fallback to original Gmail metadata response with distinct email_received_metadata event type; cursor advances only after successful enqueue, and body-based work requires a later authorized read tool. Tester notified. Requested M34 deferred retry metadata to prevent unsupported oldest inputs monopolizing claims or repeated model costs. Initial M34 tester82/82 report became stale after coder tightened cross-turn call-ID validation; evaluator reproduced79/82 due test-only reused IDs. Tester refreshing fixtures/evidence with final backoff changes.
- Decisions: exactly two cache columns; durable runner/subscription metadata separate; default disabled; no source text as permissions or instructions. Failed/partial work stays explicit.
- Checks and evidence: source inspection and coder-reported local checks as stated above. Final independent combined suite and evaluator acceptance still pending; initial evidence is not final where files changed.
- Resulting state / acceptance: Root integration in progress. M33 complete local; M34/M35 tests/review pending.
- Remaining work and handoff: finish focused coder/test corrections, independent evaluation and final integration. Cloud activation requires user onboarding and verified resources. Prompt tuning is deferred until notification.
