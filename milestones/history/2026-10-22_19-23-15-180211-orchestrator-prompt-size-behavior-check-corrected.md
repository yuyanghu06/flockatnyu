# Correct retained prompt-compaction measurement

- Local timestamp / acting role / milestone: 2026-10-22T19:23:15.180211-04:00 / orchestrator / test-phaseout.
- Requested scope: user approved retiring as many redundant automated cases as safely justified under current preservation rules.
- Starting repository state: dirty shared workspace with concurrent attendance, prompt and worker work; preserved and separately attributed.
- Work performed / changed files: Updated only tests/assistant-context-size.test.mjs to compare actual compacted evidence and prompt with their uncompacted equivalents. Kept the complete case and data-integrity assertions. No runtime changes.
- Decisions: retain distinct behavior and all protected historical SQL coverage; do not force the earlier estimated removal range.
- Checks and evidence: Final focused 15/15 checks passed. Evidence JSON shrinks 33,960 to 17,256 bytes; total prompt shrinks 55,871 to 39,167 bytes. Independent evaluator approved the correction. An unrelated event-URL fix belongs to the separate attendance owner.
- Resulting state / acceptance: accepted; see docs/test-phaseout.md, docs/test-suite-inventory-after-phaseout.csv and /tmp/techvisualized-test-phaseout2/. Earlier failed receipts remain separate from final results.
- Remaining work and handoff: no required work remains for this pass; unrelated product/release tasks remain in the rolling snapshot.
