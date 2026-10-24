# Thursday usage boundary and excluded local evaluations

- Local timestamp / acting role / milestone: 2026-10-24T10:25:17.513428-04:00 / planner (read-only specialist) / model-usage-review.
- Requested scope: identify the first Thursday planner rollout and local-model usage omitted from production audit totals.
- Starting repository state: provider fallback source/release committed; unrelated local documentation retained. No application edits authorized by this check.
- Work performed / changed files: specialist read historical rollout receipts, local model harnesses and surviving evaluation ledgers; no files edited. Orchestrator records this report.
- Decisions: earliest Thursday worker release is bede3de6, verified running by 1:26:45 PM. Orchestrator separately confirmed Railway createdAt 2026-10-22T17:21:20.651Z as rollout start. The later staged rewrite and web upload times are not substituted for this boundary.
- Checks and evidence: report/ledger timestamps and networkRequests fields establish 158 Friday requests across 15 disjoint surviving ledgers: chat time/recovery95, planner follow-up38, participant14, Spotlight11. Thursday final receipts document attendance18 and full prompt audit35; their temporary ledgers are absent and overlapping interim counts are excluded. All identified evaluation sequences are after the first rollout.
- Audit boundary checks: explicit no-op startModel/finishModel writers in tests/chat-attendance-model.mjs:20, prompt-audit-model.mjs:76, planner-followup-model.mjs:77, chat-map-time-model.mjs:90, chat-map-recovery-model.mjs:56, chat-map-participants-model.mjs:27 and chat-steering-model.mjs:32. These requests do not persist production model-call audits.
- Resulting state / acceptance: 211 documented local evaluation requests are separate from production records; only158 retain ledger evidence. Their billed token usage and cost remain unknown. This is not a complete local testing inventory.
- Remaining work and handoff: use the exact rollout-start boundary for the production recount; report account-wide cost as unverified. No credentials, network/model calls, external writes, child agents or code changes in the specialist pass.
