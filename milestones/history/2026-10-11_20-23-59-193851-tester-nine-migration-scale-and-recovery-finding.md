# Sliced planning tester pass: fixes required

- Local timestamp / acting role / milestone: 2026-10-11_20-23-59-193851; tester; M20.
- Requested scope: independent009 SQL/runner/scale/identity/atomicity acceptance before hosted application.
- Starting state: applied001–008 unchanged,009 local only,108836live originals and zero real summaries/pruning.
- Work performed / changed files: tests/discord-sliced-planning.test.mjs; tests/discord-sliced-planning-fixtures.mjs; tests/discord-summary-sql.test.mjs; evidence/m20-discord-summaries/sliced-planning-scale-*.json and sliced-planning-payload-recovery-before.log
- Decisions: do not apply009 until same-queue semantic drift and cached canonical-identity collision recover safely. Preserve exact007canonical fingerprints and all prior cost accounting.
- Checks and evidence: Independent nine-migration suite24/24 and integrated226/226 passed, APIbuild passed. Cheap preview719ms/begin723ms/repeat714ms; all695preparations16.66s, slowest744ms. Largest6397publication763ms via83maps+3reducers/86injectedrequests. Separate newly added payload-only semantic-edit recovery regression FAILED: same cheap queue fingerprint causes begin to reselect poisoned draft.
- Resulting state / acceptance: request fixes. Initial passing suites remain evidence for their bounded scope; new recovery findings prevent full009 acceptance.
- Remaining work and handoff: coder fixes new009/store exclusively; tester exercises same due/asOf, post-paid stale plan accounting and cached rename; evaluator retests/reviews. Root then applies only accepted009 and proves real REST planning before Luna.
