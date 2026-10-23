# Future test phase-out estimate

- Local timestamp / acting role / milestone: 2026-10-22T19:00:40.691865-04:00 / orchestrator / test-suite-cleanup advisory.
- Requested scope: Estimate how many remaining automated cases could eventually be phased out; no deletion request in this follow-up.
- Starting repository state: Completed cleanup: 2,450 individual cases, 139 historical cases, 169 Node test files. Independent full/focused/browser acceptance remains the preceding evidence.
- Work performed / changed files: Sampled current inventory and prompt/catalogue/transport/deployment test definitions. Tracking documents only; no application/test changes or new test execution.
- Decisions: Rough future target 180–220 cases, consisting of the known 139 historical cases only after replacement migration-upgrade coverage and an explicit change to the preservation rule, plus an estimated 40–80 prompt/text/overlapping contract cases requiring a detailed consolidation review. This range is judgment from sampling, not an exact safe-delete inventory. Current-rule review pool is 40–80; no additional case is newly certified safe by this pass.
- Checks and evidence: Read after-cleanup CSV and selected stable-tool-catalogue, update-agent-prompt, chat/Discord policy, transport parity and deployment tests. No tests rerun because files did not change.
- Resulting state / acceptance: Advisory estimate only. Existing tests, permissions, historical-preservation rule and completed cleanup remain unchanged.
- Remaining work and handoff: Any future reduction needs per-case overlap evidence and retained behavior validation. No new implementation/deletion initiated.
