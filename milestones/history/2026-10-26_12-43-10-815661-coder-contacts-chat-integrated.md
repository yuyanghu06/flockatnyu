# Contacts chat integrated

- Local timestamp / acting role / milestone: 2026-10-26T12:43:10.815661-04:00 / coder / contacts-tools.
- Requested scope: Implement separately callable contact operations and shared chat wiring.
- Starting repository state: Accepted plan, existing live contacts047, unrelated dirty work preserved.
- Work performed / changed files: Wired contactsTools through runtime/app/shared website+Discord chat runner/retrieval. Added bounded six-field model projections, receipts/capability/replay support, conflict reread and steering revisions, contacts prompt policy and folder guides. Generic direct contact write endpoint and autonomous planner remain unchanged.
- Decisions: No new migration, real contact writes, autonomous CRM ingestion or deployment. Fields never enter content-free audit/NDJSON metadata; prompt sequences individual calls.
- Checks and evidence: Integration coder ran49existing context/context-size/runner/catalogue/Attio checks; all passed. Primary initial regression run41passed with2Calendar diagnostic failures; separate untouched HEAD archive reproduces exactly those2failures, proving no contact regression. Evidence: ignored evidence/contacts-tools/baseline-diagnostics.txt.
- Resulting state / acceptance: Implementation ready for independent behavior/model checks and final review.
- Remaining work and handoff: Freeze implementation for bounded real configured-model API evaluation on simulated contact storage, then final independent evaluator.
