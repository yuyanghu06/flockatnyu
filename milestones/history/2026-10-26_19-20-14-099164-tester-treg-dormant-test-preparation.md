# Independent dormant-route tests prepared

- Local timestamp / acting role / milestone: 2026-10-26T19:20:14.099164-04:00 / tester / treg-dormant-routes.
- Requested scope: Four backend operations, left unregistered; preserve current no fallback.
- Starting repository state: Existing Treg search/email enrichment clients and tools; broad unrelated changes preserved.
- Work performed / changed files: Inspected existing clients/logger/auth behavior and prepared evidence/treg-dormant-routes/preparation.json. No application edits or behavior execution yet. Identified that existing full_name-based enrichment validation cannot validate the four new response types.
- Decisions: New server/treg-lookups.js exports TREG_LOOKUP_CONTRACTS, validTregLookupInput and createTregLookupClient with lookup({operation,input,requestId,principal,signal}). New server/treg-lookups-api.js exports optional registerTregLookupApi. No running imports or registrations. Each operation uses its own exact fixed endpoint and typed output, one call, existing cap/logging; no raw responses outside private logs.
- Checks and evidence: Public catalog metadata and https://github.com/superdesigndev/treg/blob/main/src/treg/application/call/route.py establish email_find/email_verify/phone_find/company_enrich contracts. Pending is distinct from a completed miss; unknown verification is never upgraded to valid. Simulated tests will use actual client/HTTP/logger implementations. No real-model evaluation needed because no prompt changes.
- Resulting state / acceptance: Plan/preparation accepted. Coder and tester have exclusive implementation/test files; neither owns journal/docs.
- Remaining work and handoff: Implement, independently run meaningful checks and dormancy boundaries, API/package checks, evaluator review/fixes, integrate guides. No deployment or paid calls.
