# Daily dependencies isolated

- Local timestamp / acting role / milestone: 2026-10-27T10:59:07.041815-04:00 / coder, serialized by orchestrator / gmail-enrichment-providers.
- Requested scope: Daily Gmail runtime only, Apollo then AIArk, maximum two providers total; no CSV rerun or website release.
- Starting repository state: Initial logic passed, package isolation finding blocked upload until shared dependencies were removed.
- Work performed / changed files / decisions: Coder replaced shared credential/email imports with faithful daily-local pure helpers in treg.js; config.js imports that helper without a cycle. No top-level network/filesystem work. Provider/native/budget/replay logic unchanged. Six core worker checks, API build, syntax/whitespace pass. Final newclient SHA05c9cdf4de0e088d7cc9fae7a790d566be61bc69a4fa0163dc2b14b8e72253a8; configd6d1f2b1feeed9ad863027497f2c17e02fb702ef5abc57a55be4d292e861eb97. No shared website/Contacts edits, external requests or deployment.
- Checks and evidence: evidence/gmail-enrichment/providers/ holds independent-final-affected.tap, independent-final-pins.json and final15-file deployment manifest. Root API build and git diff --check pass. No paid test, business write, schema operation, commit or push.
- Resulting state / acceptance: Final affected behavior and source/package scope pass; evaluator launch verdict pending before release.
- Remaining work and handoff: Obtain independent launch acceptance, set service-only max providers2 and deploy only reviewed Gmail package. Verify actual live policy/readiness/off-hour skip, preserved cron/private volume and unchanged web deployment; report natural Apollo response unverified until scheduled run.
