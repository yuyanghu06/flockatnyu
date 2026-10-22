# Provider retries implemented

- Local timestamp / role / milestone: 2026-10-21T12:50:45.250969-04:00 / coder / harness reliability.
- Requested scope / starting state: first recommendation implementation, committed9a4b037 baseline, concurrent queue/tests owned separately.
- Work/changed files: server/providers/index.js, server/providers/retry.js, server/providers/info.md.
- Decisions: All three provider operations now share a fetch-only retry dispatcher with at most3audited attempts,1s/3s waits, explicit transient status/code classification and Retry-After lower bounds under one original deadline. Successful response processing cannot replay. SSE rejects malformed UTF-8. Cancel-aware fetch/sleep/body cleanup resolves the independent timeout finding.
- Checks/evidence: coder108existing provider/native/attachment/audit tests passed before cleanup correction;82targeted retry/provider/audit tests passed after correction. Both JS syntax checks and scoped diff check pass. Independent tester88final checks recorded separately.
- Acceptance/limitations: implementation ready for read-only review; synthetic local verification only. Audit storage retains its separately bounded lifecycle. No model calls/schema/deployment changes.
- Handoff: independent review underway; queue implementation/acceptance and parent regression/build remain.
