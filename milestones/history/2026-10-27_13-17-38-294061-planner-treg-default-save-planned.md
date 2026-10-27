# Treg discovery and separate Contacts saving planned

- Local timestamp / acting role / milestone: 2026-10-27T13:17:38.294061-04:00 / planner / treg-default-save.
- Requested scope: Tighten chat behavior for finding people at companies and enriching people; save successful returned people to Contacts by default. User clarified that company enrichment means people at companies, not company API activation.
- Starting repository state: Contacts CRUD tools already registered; Treg lookup tools expose six-field projections and explicitly prohibit default saving. Raw data must remain complete and private.
- Work performed / changed files: Independent read-only planner inspected prompt, adapters, store, logging and runner. Root assigned coder implementation and tester separate new test/harness files; shared documentation remains root-owned.
- Decisions: Add separate import_treg_contacts accepting bounded opaque result IDs backed by actor/run-bound server memory. Lookup and save stay individual tool calls chosen by model. Preserve native raw, exact lookup email separately, insert-only duplicates/human edits, explicit current no-save overrides default. No company API, cache/daily worker or schema change.
- Checks and evidence: Source inspection only; implementation and real-model evidence pending. Existing tests explicitly saying no-save remain regression cases.
- Resulting state / acceptance: Bounded plan accepted. Real-model tests use configured inference only, simulated providers/storage and cumulative 32 HTTP request ceiling, six per case.
- Remaining work and handoff: Implement, independently test, review, isolate website release and verify read-only catalogue/readiness. Do not run paid Treg or mutate production Contacts for tests.
