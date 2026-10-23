# Chat labels and identical duplicate rows implemented

- Local timestamp / acting role / milestone: 2026-10-23_18-49-17-701351 / coder / chat-map-participants.
- Requested scope: fill omitted labels and remove repeated participants only when no differing facts are supplied.
- Starting repository state: accepted d90f9d5 chat runtime; unrelated dirty planner/docs preserved.
- Work performed / changed files: tools/map/chat.js makes only chat labels optional, copies same-event same-person label from the authorized request-local read or defaults empty, retains explicit empty clearing. Completed participant facts use conservative canonical equality and shared null boundary defaults; identical rows retain the first occurrence, differing rows reject with original submitted indices. Direct event identity uses distinct canonical participant UUIDs. tests/chat-map-recovery.test.mjs adapts old duplicate rejection cases to current semantics while keeping building-duplicate advisory and conflicting-participant recovery coverage.
- Decisions: no hidden reads, no boundary inheritance expansion, no new no-op policy, no shared contract/service change, no version repair or duplicate-building normalization.
- Checks and evidence: coder reports 58 recovery/time/policy checks pass, API build and owned whitespace checks pass. Independent tests and review underway; no inference or deployment in this pass.
- Resulting state / acceptance: implementation frozen for independent verification, not release accepted yet.
- Remaining work and handoff: participant-specific test matrix, bounded actual-model gate on synthetic storage, independent evaluation, integration/release.
