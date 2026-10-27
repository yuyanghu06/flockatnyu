# CSV email-only batching planned

- Local timestamp / acting role / milestone: 2026-10-26T19:40:39.935563-04:00 / planner / treg-csv-email.
- Requested scope: Test supplied CSV through email-only Treg enrichment; assess batching.
- Starting repository state: Existing deployed one-to-ten email lookup API and separate9AMET Gmail service; unrelated dirty working tree preserved.
- Work performed / changed files / decisions: Independent read-only planner verified 4,125 CSV rows, 2,362 production-valid email rows and 2,361 unique addresses. Existing authenticated enrich_treg_people API accepts one to ten emails, validates the complete batch, returns ordered outcomes and deduplicates within a request. No application change is needed. Global CSV deduplication belongs in the test harness; upstream remains one email per lookup. Root owns private test evidence and shared journal. No planner edits or external requests.
- Checks and evidence: Production email validator, actual hosted API pilot and reviewed source; no private lead values or credentials in journal.
- Resulting state / remaining work: Pilot complete; independently verify bulk harness and process remaining unique emails under the user-selected $10 limit. Scheduled Gmail service remains unchanged.
