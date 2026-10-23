# Read-only repair brief

- Local timestamp / acting role / milestone: 2026-10-22T19:31:14.952742-04:00 / planner / live-planner-calendar-tests.
- Requested scope: natural Chrome Discord tests, exact replacement-channel-only manual triggers, failures and final synthetic cleanup; user authorized discovery repair.
- Starting repository state: extensive concurrent dirty work preserved.
- Work performed / decisions / evidence: A shared in-progress generation can falsely satisfy a later metadata refresh, allowing unknown-channel input to be ignored. Proposed freshness requests plus checkpoint/replay checks preserve full publication and existing budgets. This prevents loss but does not remove archive delay; expanded prompt-publication design is assigned before implementation. No runtime changes.
- Changed files: root journal and behavior report only for this pass; tester owns ignored evidence. No collector implementation or deployment yet.
- Resulting state / acceptance: testing remains incomplete; no natural planner success claimed.
- Remaining work and handoff: Complete practical delay repair design; assign exclusive implementation/tests and independent review.
