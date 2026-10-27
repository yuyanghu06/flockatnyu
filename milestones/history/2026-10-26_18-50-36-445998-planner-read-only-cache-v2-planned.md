# Read-only sender cache v2 plan accepted

- Local timestamp / acting role / milestone: 2026-10-26_18-50-36-445998 / independent planner / gmail-cache-enrichment.
- Requested scope: keep contacts_cache only for raw unenriched input; store enriched native data only in Contacts.
- Starting state: local v1 cache-backwrite code was unapplied; live read-only probe confirmed no050state/RPC or enriched cache rows.
- Work: planner inspected currentSQL/worker/store/tests and gave a bounded v2 design. Root assigned separate SQL/worker/test ownership and retained docs/journal integration.
- Decisions: cache SELECT/locks only, metadata-only jobs keyed cache ID plus whole-original hash, global lease/budget state, durable request IDs. Five v2 RPCs:probe/claim/renew/complete/defer. Atomic completion writes native Contacts and terminal metadata receipt together. No envelopes/profiles in processing tables, no cached-response recovery, no cache deletion/rewrites. The separately authorized private full-call log remains.
- Acceptance: exact original cache equality through all outcomes; processing table schemas/data contain metadata only; atomic insert/receipt/budget rollback, lost committed response no new lookup, precommit failure retries stable UUID, source/lease fences and human edits preserved. Same costs/timeouts/retry limits.
- Result/handoff: planner ACCEPT; v2 implementation/testing underway. No hosted migration or data write/deploy/paid call. Previous v1 acceptance is explicitly superseded.
