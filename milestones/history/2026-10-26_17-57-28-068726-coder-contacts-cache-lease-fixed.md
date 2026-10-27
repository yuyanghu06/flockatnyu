# Contacts cache lease edge fixed

- Local timestamp / acting role / milestone: 2026-10-26T17:57:28.068726-04:00 / coder / contacts-cache.
- Requested scope: Incoming Gmail senders staged in contacts_cache with UUID/date+time/raw email/name only.
- Starting repository state: Existing Contacts website and other local work preserved; cache049not applied yet.
- Work performed / changed files: Independent tester found callback completion after lease expiry could still enqueue. Added a fresh ownership CAS after accepted cache callback and before enqueue, without cursor advancement. Expired/stolen lease now blocks further dispatch; already cached row safely replays. Coder targeted35Gmail/mailbox checks pass; syntax/whitespace pass.
- Decisions: No direct Contacts writes, outbound capture, extra columns, body/source archive, historical import, retention job or model call. Only reviewed049 and Gmail service may be applied/deployed. 046/048remain unapplied and fuzzy/filter/prompt work is held locally.
- Checks and evidence: evidence/contacts-cache/report.json, cache-gmail.log, gmail-package.log and package-review.json. Normal API/syntax/whitespace pass. All integration tests use simulated OAuth/Gmail/PostgREST with actual local SQL/helper/runtime code.
- Resulting state / acceptance: Local implementation and pre-application review accepted.
- Remaining work and handoff: Root applies049, verifies actual schema/grants/API and deploys only Gmail, then checks healthy service and explicit limits. No hosted sender-arrival proof yet.
