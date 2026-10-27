# Treg agent tools offline behavior verified

- Local timestamp / acting role / milestone: 2026-10-26T18:58:59.774391-04:00 / tester / treg-agent-tools
- Requested scope: Expose separate Treg people-search and array-email enrichment chat tools.
- Starting repository state: Existing unrelated work and Gmail-enrichment changes preserved; Treg clients existed outside chat tools.
- Work performed / changed files: Independent tester added tests/treg-tools.test.mjs, tests/treg-tools-model.mjs and tests/fixtures/treg-tools.mjs. Actual clients/logger, shared chat runner and authenticated Hono API exercised with simulated transports and temporary private logs.
- Decisions: Lookup-only, separate calls, no Contacts/cache writes; six supported explicit string fields; raw full-call logs stay private.
- Checks and evidence: Tester reports nine offline groups passing: lookup isolation; raw/private-log and supported-field preservation; ordered mixed batches; concurrent/overlap replay; validation/auth/cancel; unknown matched shapes; logging/parse/size failures; projection/metadata privacy and ordinary-error continuation; mid-batch cancellation. Six scripted model-harness mechanics pass. These are deterministic fixtures, not real-model or live-Treg evidence.
- Resulting state / acceptance: offline accepted; real-model evaluation pending
- Remaining work and handoff: Run the frozen six-case configured-model evaluation with inference-only network and 28-request hard cap, then evaluate final code and evidence.
