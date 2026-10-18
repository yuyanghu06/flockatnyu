# Structured map independent verification

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664241-04:00 / tester / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Independently verify final prompt delivery, schema parity and preserved permissions.
- Starting repository state: Final contracts/prompt with both user-approved policies and bounded review correction.
- Work performed / changed files: Added tests/map-contracts.test.mjs and tests/update-agent-prompt.test.mjs; evidence/structured-map-prompt captures exact commands, counts, hashes and limitations. Loaded actual001–024 SQL in PGlite and captured real handler provider instructions with synthetic clients.
- Decisions: Distinguish structural/SQL validity and instruction delivery from actual LLM compliance or agent deployment.
- Checks and evidence: Combined206/206 passed before final wording fix; final-source focused32/32 passed after fix. Earlier198/203 runs retained as intermediate evidence. Applied021–024 hashes unchanged; unknown map actions/plaintext completion preserve pending work. See evidence/structured-map-prompt/report.md.
- Resulting state / acceptance: PASS for assigned scope; runtime only permits people_here writes and no map tools are registered.
- Remaining work and handoff: Future trusted adapters must enforce source/identity/time/Unicode/all-day semantics and deterministic defaults; no live-model proof.
