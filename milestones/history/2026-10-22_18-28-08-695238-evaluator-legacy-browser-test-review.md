# Legacy browser harness review

- Local timestamp / acting role / milestone: 2026-10-22T18:28:08.695238-04:00 / evaluator / test-suite-audit.
- Requested scope: Full repository test inventory, high-level coverage, legacy classification and safe deletion recommendations.
- Starting repository state: Existing dirty working tree and concurrent cache implementation preserved.
- Work performed / changed files: Confirmed7old browser harnesses with56named checks are legacy but contain unique current geometry, palette, world-placement and actual-pointer checks. Preserve/move those before deleting harnesses. Four capture-only tools contain no assertions and can be retired without changing case count.
- Decisions: Use separate individual-case, parent-test and standalone-script counts; no cleanup implementation authorized by this audit request.
- Checks and evidence: Read-only review of src/style.css/current map sources and named old browser harnesses; no browser run.
- Resulting state / acceptance: Audit pass accepted, including explicit test failures and scope limits.
- Remaining work and handoff: No wholesale56case deletion recommendation.
