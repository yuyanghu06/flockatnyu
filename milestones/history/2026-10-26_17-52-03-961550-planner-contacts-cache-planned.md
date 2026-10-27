# Contacts cache plan accepted

- Local timestamp / acting role / milestone: 2026-10-26T17:52:03.961550-04:00 / planner / contacts-cache.
- Requested scope: New contacts_cache first destination for incoming inbox contacts, containing only UUID/date+time/raw email/name.
- Starting repository state: Existing Contacts website live; concurrent Treg local work and unfinished fuzzy/filter/prompt files preserved.
- Work performed / changed files: Read-only plan accepted: exactly id UUID, created_at timestamptz and raw_input JSONB object. Service-only forced RLS. Cache raw email plus optional display name, no source/body/provenance fields. Inject a separate cacheInboxSender step after authorized full/metadata fetch and before existing enqueue; filter only cache callback to INBOX, exclude SENT/DRAFT/SPAM/TRASH/self/missing/ambiguous senders. Deterministic email UUID, ignore duplicate without rewrite. Failures retain current offset/cursor; existing queue/watch/history behavior remains unchanged. Apply only049 and release Gmail collector only.
- Decisions: Timestamp combines date/time in one column; no updated_at, processing/provenance columns, archive/backfill, direct Contacts writes or model call. Root applies only reviewed049 and owns Gmail-only release; coder owns Google helper/subscription wiring/SQL; tester owns focused SQL/workflow tests.
- Checks and evidence: Actual preflight: contacts_cache absent, contacts_search absent, Contacts count0. Earlier fuzzy tester reports only syntax/whitespace checks, no external/model/business calls. UI coder reported its own synthetic smoke; no independent acceptance/release of that work.
- Resulting state / acceptance: New bounded cache plan accepted; implementation/testing in progress.
- Remaining work and handoff: Implement, independently test/review, create live cache table, package/deploy only Gmail collector and verify without fabricated Gmail/Contacts records.
