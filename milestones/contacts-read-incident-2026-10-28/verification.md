# Contacts list repair verification

## Local acceptance

The new service-only `contacts_search_fields` returns exactly ID, creation/update
timestamps and six supported strings. It delegates selection and ranking to the
existing search with ordinality, preserving filters, order and lookahead paging.
The existing full-row function, all contacts, raw profiles and timestamps remain
unchanged. Exact reads still supply the versioned raw snapshots required for edits.

Independent synthetic PostgreSQL/store/API/tool checks: 34/34 pass. The oversized
native page is reduced to summaries, paging/filter/order and service-only grants
are checked, and edits preserve unmentioned native data and later human changes.
A redundant assertion comparing two spellings of the same timestamp was removed;
actual database before/after timestamp/raw comparisons remain.

Five browser flows pass using installed headless Chrome and simulated services.
The Contacts flow loads ten records, loads all fourteen, edits supported fields
while preserving hidden native data, and checks mobile bounds. No hosted business
mutation or model request was used.

Full `npm run ci`: 3,082 pass, zero fail, two optional skips. Formatter, lint,
physical line limits and API/frontend builds pass. Independent evaluator ACCEPT.
Private ignored evidence lives in `evidence/contacts-read-fix-2026-10-28/`.

## Deployment plan and current limits

Publish through main and the normal exact-commit release workflow. Apply only
reviewed migration056 before deploying web. Prior known-good web deployment is
42817ad6-8cf1-4bd7-90d8-4cc5f412db99 from main5e62ffe. Preserve the four unrelated
services, variables, volumes and source access. The old function stays installed
for source rollback. Migration does not change existing stored rows.

Production before baseline: 28 contacts; aggregate raw/lookup/timestamp state
fingerprint e93f6d60505864e110445ab177b70ae2. New function absent. This baseline
was computed inside the database; no raw contacts or identities were retained.

No migration/deployment result is claimed yet. Verify the new function's narrow
shape, grants and default payload; actual authenticated ten-result/default,
filters and next pages; process health and preserved authentication; and unchanged
aggregate raw state. Other profiles/pages beyond actual checked requests remain
qualified. The existing size cap can still reject pathological escaped maximum
field values; there is no expanded raw-data budget or universal fit claim.
