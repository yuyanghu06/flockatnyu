# Separate Treg agent tools independently accepted

- Local timestamp / acting role / milestone: 2026-10-26T19:01:50.799630-04:00 / evaluator / treg-agent-tools
- Requested scope: Expose separate Treg people-search and array-email enrichment chat tools.
- Starting repository state: Existing unrelated work and Gmail-enrichment changes preserved; Treg clients existed outside chat tools.
- Work performed / changed files: Read-only evaluator inspected adapter, runtime/app/shared chat registration, strict projection/prompt, optional feature label, tests and actual model outputs. No application or test edits.
- Decisions: Lookup-only, separate calls, no Contacts/cache writes; six supported explicit string fields; raw full-call logs stay private.
- Checks and evidence: Evaluator independently ran node --test tests/treg-tools.test.mjs tests/treg-enrich.test.mjs tests/treg-contacts.test.mjs tests/treg-call-log.test.mjs:27pass, exit0. Reviewed original and corrected actual gpt-6-luna output:6intended scenarios covered with21/28requests, zero proposed/attempted/applied Contacts writes and stable production hashes. Accepted root50focused checks, both builds and286-file isolated web package; counts overlap. Preserved original discovery assertion error and documented scripted-only harness correction. Two observed Calendar fixture failures remain outside Treg scope, with pre-change status unproven.
- Resulting state / acceptance: local implementation ACCEPT
- Remaining work and handoff: Complete final journal integration and report the two tool names and local-only release status.
