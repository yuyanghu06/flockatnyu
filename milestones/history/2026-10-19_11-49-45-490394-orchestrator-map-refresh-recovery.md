# Browser map refresh recovery implementation

- Local timestamp / acting role / milestone: 2026-10-19T11:49:45.490394-04:00 / orchestrator / production map refresh.
- Requested scope: automatically show map updates and fix current unavailable production card.
- Starting state: hosted5second failures; separate read-only probe of actual provider/data succeeded after10477ms with7serial checks,9buildings/5events/0currently active people. No data writes.
- Work performed: src/map-presence.js coalesces write notifications into one post-pending read and retries transient failures after1/3seconds, bounded to2consecutive retries. Successful reads reset the budget; disposal clears timers.401/403are not retried. Failed reads still clear stale activity to preserve source access.
- Decisions: retain existing write-completion event and8second browser timeout; no new stream payloads, identity changes or future-attendance early avatars.
- Checks/evidence: implementation only; independent tester preparing realChrome regression. Backend optimization concurrent in exclusively owned files.
- Result: local implementation pending verification; not deployed.
- Handoff: integrate backend, independent browser/Node review, then protected hosted rollout.
