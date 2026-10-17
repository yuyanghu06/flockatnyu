# Hosted agent schema and receipt recovery accepted

- Local timestamp / acting role / milestone: 2026-10-17_14-23-00-164023 America/New_York / independent evaluator / M33–M35.
- Requested scope: verify hosted018/019 and safe recovery of a missing migration receipt; read-only evaluation.
- Starting state:018 API succeeded;019 API returned400 despite committed matching schema;019 history receipt was absent.
- Work performed: root verified committed objects before inserting only the missing019 history record, with exact original SQL and a unique version. Evaluator independently inspected hosted catalogs/history; no evaluator writes.
- Checks: all8 new function bodies match local019 byte-for-byte, signatures/security/search paths/ACLs match; exact2cache columns, keys and forced RLS verified. All3 prior table schema/ACL/data fingerprints and20 prior functions/ACLs unchanged. Receipts01820261017182014 and01920261017182143 each preserve exact full local SQL. Evidence: evidence/m35-gmail-subscription/hosted-migrations.json.
- Decisions: API400 cause remains unknown. No old history edits or DDL replay during receipt recovery. A second019 apply attempt was rejected at existing relation and made no changes.
- Result: independent ACCEPT for hosted schema/history. Google Cloud user-executed topic/IAM/subscription output is now visible through the newly enabled Tech@NYU Chrome profile. New Railway Gmail secrets are provisioned; deployment94e195f7-cf24-4b46-aefc-238d035012cb is building.
- Remaining: verify running callback, watch and authenticated delivery; LLM execution/map/Calendar writes remain inactive and need trusted adapters. No sends or model calls.
