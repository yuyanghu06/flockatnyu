# Direct Contacts intake stopped

- Local timestamp / acting role / milestone: 2026-10-26T17:52:03.961550-04:00 / orchestrator / contacts-cache.
- Requested scope: New contacts_cache first destination for incoming inbox contacts, containing only UUID/date+time/raw email/name.
- Starting repository state: Existing Contacts website live; concurrent Treg local work and unfinished fuzzy/filter/prompt files preserved.
- Work performed / changed files: User explicitly stopped the direct Contacts intake direction and replaced it with an inbox-only contacts_cache staging table. Interrupted active fuzzy/backend/model preparation. No migration048/function, inference run or feature deployment occurred; hosted preflight confirms contacts_search absent and Contacts count0. Preserve unfinished fuzzy/filter/prompt files unpublished; do not use them for this release. Outgoing sender/recipient intake is superseded by current INBOX-only request.
- Decisions: Timestamp combines date/time in one column; no updated_at, processing/provenance columns, archive/backfill, direct Contacts writes or model call. Root applies only reviewed049 and owns Gmail-only release; coder owns Google helper/subscription wiring/SQL; tester owns focused SQL/workflow tests.
- Checks and evidence: Actual preflight: contacts_cache absent, contacts_search absent, Contacts count0. Earlier fuzzy tester reports only syntax/whitespace checks, no external/model/business calls. UI coder reported its own synthetic smoke; no independent acceptance/release of that work.
- Resulting state / acceptance: New bounded cache plan accepted; implementation/testing in progress.
- Remaining work and handoff: Implement, independently test/review, create live cache table, package/deploy only Gmail collector and verify without fabricated Gmail/Contacts records.
