# Main pull local checks

- Local timestamp / acting role / milestone: 2026-10-26T12:17:07.834397-04:00 / tester / folder rename and main integration.
- Requested scope: Check folder rename and pull main while preserving current work.
- Starting repository state: Local uncommitted operational records and rename audit; codex/dev initially fba416a, origin/main24commitsahead.
- Work performed / changed files: At HEAD4e974d0, independent npm run build:api and npm run build PASS. Same offline command node --test tests/dev-runtime.test.mjs tests/runtime-deploy.test.mjs tests/collector-deploy.test.mjs tests/map-asset-integrity.test.mjs with sanitized environment:16pass/1samepre-existingfailure. Startup/proxy/shutdown/assets/packaging pass. Existing collector-deploy.test.mjs:150 still omits metadata-reconcile.js from its exact expected list; no new failures. No source/test edits, model calls or live integrations.
- Decisions: Keep historical paths as history, preserve upstream updates and local notes, report unrelated failures separately.
- Checks and evidence: Exact relevant commands/outcomes recorded above; private CLI/env values are excluded.
- Resulting state / acceptance: Assigned pass accepted within stated scope; HEAD4e974d0 and retained work remain uncommitted.
- Remaining work and handoff: No remaining requested rename/pull work. Unrelated collector-test mismatch and upstream product backlog remain separate.
