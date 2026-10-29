# Saved Contacts operation service

Model-facing descriptions, parameter guidance and returned instruction notices are maintained under root `prompts/tools/`; these modules keep fixed references, structural schemas and service behavior.

`schema.js` contains unchanged operation names, descriptions and input schemas.
`service.js` owns validation, exact private read snapshots, receipt replay,
sequential imports, admitted-input revisions and uncertain-write/logging fences.
The API factory constructs this service, then exposes bounded private HTTP
operations through the common adapter. No backend service imports thin tools.

The trusted createRequest context may contain the shared native Treg result-cache
object. It remains server-side with complete native records and private append
callbacks; only existing opaque resultIds enter operation JSON. The Contacts-only
import resolves those IDs locally and never calls Treg. Existing store/version,
actor, native-preservation and confirmed-receipt behavior is retained.

## Preserved operation behavior

Saved-contact search fetches only IDs, timestamps and six bounded strings through `contacts_search_fields`; it retains the existing model result format. Search summaries cannot become edit snapshots. Saved-contact results contain only the six projected supported strings; request-local exact private snapshots preserve native JSON and lookup_email through authorized edits. Reading a contact triggers no source/provider fetch.

`schema.js` defines separate search, exact read, create, update and delete tools
for the existing Supabase `contacts` table. `service.js` executes them using only the saved contacts
store in `server/contacts/store.js`; no source originals or other services are fetched.

Tool writes accept six optional string fields: first_name, last_name, email,
phone_number, workplace and notes. Creation fills omitted fields with empty
strings. Updates change only supplied fields; an empty string explicitly clears
a field. Unmentioned fields and legacy JSON values survive unchanged.

Chat uses `createRequest` with its verified principal and current human message.
An update or deletion requires a successful exact read in that request and the
same unmodified timestamp. The store also checks that timestamp atomically in
the database. Repeated write calls reuse their original receipt; uncertain writes
block further writes and are never silently retried. `advanceUserInput` marks a
later admitted human turn without discarding previous receipts or uncertainty.

Search results do not authorize edits, and contact text cannot grant permissions.
The prompt chooses tools and resolves ambiguous people with the user. Only
confirmed writes return a content-free contactWrite receipt. Direct stateless
execution cannot update or delete because it has no exact-read snapshot.

Tool results expose only the six supported string values through the shared
`server/contacts/fields.js` reader. It understands the observed native
`found`/`person` envelope and separately saved lookup email; explicit manual
top-level fields, including clears, take precedence. Exact read snapshots stay
private inside the request adapter so edits preserve complete native JSON and
lookup metadata without returning them to the model.

`import_treg_contacts` is a separate Contacts-only insert operation. It accepts up
to ten opaque person resultIds observed in the same actor-bound chat run. The
server resolves their complete native JSON from short-lived memory, never from
model-supplied fields or private log retrieval. It does not call Treg or another
service. Existing rows are preserved; exact verified enrichment lookup emails
can be retained separately without modifying provider JSON. Replay shares
per-result promises, required logging failures stop later writes, and uncertain
writes fence all subsequent changes. Confirmed imported/existing items return a
bounded `contactImport` receipt; a logging failure after insertion retains that
confirmed receipt and reports partial completion. The model chooses lookup and
save separately, with default saving for requested Treg discovery/enrichment and
an explicit current no-save instruction taking precedence.
