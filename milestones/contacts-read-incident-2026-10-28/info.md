# Authorized repair and deployment

The user resumed this diagnosed incident and explicitly requested a deployed fix.
Current scope includes additive migration056, supported-field search DTOs,
independent regression/browser verification, reviewed main/release packages and a
web-only rollout. Preserve every stored raw profile, human edit and timestamp.
The existing full-row function remains for rollback and exact operations. No
prompt/frontend wording change, model call or unrelated service rollout is needed.
Current status: local repair independently ACCEPTED; full CI and browser flows pass. Reviewed publication/release and production verification are next. No repair deployed yet.

# Contacts production read incident

- Goal: Explain why production Contacts table reads fail and verify the actual failure without changing saved contacts or production runtime.
- Scope: Read-only code trace, safe authenticated production reads, bounded independent verification and review. No paid model calls, provider lookups, schema/configuration/deployment changes or business writes.
- Completion criteria: Reproduce production failure, distinguish row count from total response bytes, verify the responsible code path and sampled exact reads, obtain independent review, and record remediation limits.
- Status: Diagnosis complete and independently ACCEPTED. Production is still affected. No repair implemented.

## Findings

The frontend requests ten results. The service-only database function fetches one
extra result to detect another page, returning complete native raw profiles for
all eleven. server/contacts/store.js bounds the entire response at 256,000 bytes;
supported display fields are selected only after this response is read. The
production response is 291,451 bytes and the website returns HTTP 503 with `response_too_large`.
Five requested results also fail (six database rows, 277,472 bytes). One-result
paging and exact reads of the two largest sampled profiles succeed. The browser
maps this particular status to its generic unavailable message.

This existing raw-row transfer and cap predate the October 28 planner release.
The exact historical onset and which import changed the page size are unknown.
The read-only evidence does not prove all saved contacts/pages work or explain
all unrelated service logs.

## Evidence and data boundary

Private ignored evidence: evidence/contacts-read-incident-2026-10-28/initial-probes.json,
independent-verification.mjs and independent-verification.json. The independent
script ran eight requests including login and saved only statuses/counts/sizes.
Secrets, cookies, raw contacts and contact identities are not saved.
Source anchors: server/contacts/store.js:7 and 134; server/contacts/search.js:74;
supabase/migrations/202610270051_contacts_native_fields.sql:122 and 131;
src/features/contacts/contacts-directory.js:155.

## Recommended next action

Make directory searches return the six supported fields, ID and timestamps,
while retaining full raw data in storage and exact reads/version checks for
editing. Preserve database ranking, filters, stable paging, human edits and
private access. This is a recommendation, not implemented remediation.
Use synthetic large profiles to verify list/chat paging and raw preservation;
verify the real browser flow and a reviewed deployment separately if selected.

Independent final evaluation accepts the diagnosis and qualified first-page evidence.
The rolling snapshot links all planner, tester, evaluator and integration passes.
