# Contacts

The private Supabase `contacts` table stores a UUID, creation/update timestamps and a `raw_input` JSON object per person. Migration051 adds optional `lookup_email` for the verified address used to request enrichment, outside the native provider JSON. The database manages timestamps. It is separate from map identities and the external Attio CRM.

## Contact fields

The model tools accept exactly these string fields:

| Field | Meaning |
| --- | --- |
| `first_name` | First or given name |
| `last_name` | Last or family name |
| `email` | Email address as supplied |
| `phone_number` | Phone text, preserving formatting and leading zeros |
| `workplace` | Employer or organization |
| `notes` | Notes supplied by the user |

Saved native records with `{person: {...}}` (with `found` absent or true) display supported strings from `person`; other unknown shapes remain saved without guessing. If the provider omits email, the separately saved lookup email supplies it. Explicit top-level manual fields, including empty strings or nulls, take priority and suppress that fallback. The same projection controls browser/model results, search, filters, sorting and email duplicate checks. Native JSON is unchanged by reading or importing.

Missing fields on manual creation are empty strings. An edit changes only fields supplied in that edit; an empty string explicitly clears that field. Other saved fields, including older additional JSON keys, survive unrelated edits. Tools reject unsupported field names and oversized values. They do not guess missing contact information.

## Model operations

- `search_contacts` searches or lists a bounded page of saved contacts. An incomplete page cannot establish that a contact does not exist.
- `read_contact` reads one exact UUID and its update timestamp.
- `create_contact` creates one contact from the supplied fields.
- `import_treg_contacts` saves one to ten successful native Treg person results from opaque IDs returned in this chat run; it never calls Treg itself. Existing contacts and human edits are preserved.
- `update_contact` edits fields on one exact contact previously read in this request, using its exact update timestamp.
- `delete_contact` removes one exact contact previously read in this request, using its exact update timestamp.

The chat prompt tells the model to identify the intended contact, ask about ambiguous matches, read the exact record and then choose the requested edit or deletion. Tool implementations operate only on contacts; none fetches Discord, Gmail, Calendar, Attio or map data. Notes are saved data, never instructions or permission to change records. A current user instruction can authorize a change; quotations, hypothetical examples and read-only requests do not. Requested Treg discovery/enrichment saves successful people by default through the separate import tool, unless the current user explicitly says not to save.

Version checks prevent a stale edit or deletion from overwriting a newer change. A failed or uncertain write must not be reported as successful or blindly repeated. Success receipts identify the confirmed operation and contact without including personal field values. Server authentication and private database access remain required.

## Integration and verification

The new operations are intended for the shared website/Discord chat runner. The autonomous update agent's Calendar/map responsibilities remain unchanged. Implementation and actual verification status are recorded in the [milestone snapshot](../milestones/milestone.md).

The bounded real-model checks use the configured inference API, production chat runner and contact adapters with simulated contact storage. They inspect proposed calls, attempted/applied changes, exact saved fields and final answers. Business-service network access is blocked during that evaluation. Model behavior checks do not establish a Railway deployment or real-contact mutation.

Current local verification: all nine configured `gpt-6-luna` cases passed using 42 inference requests, with unchanged source hashes. Compatible Contacts tools and routes are included in the website deployment recorded in the milestone. Hosted authenticated list/search reads now pass; live mutations, Discord contact flows and worker deployment are not claimed. Run offline checks with `node --test tests/contacts-tools.test.mjs tests/contacts-sql.test.mjs`. The model harness requires private configured inference credentials; invoke `node --env-file-if-exists=.env --env-file-if-exists=.env.google tests/contacts-model.mjs --live-model --max-requests=48` only with finished source and simulated persistence. Its nine scripted `--self-check` cases verify fixture mechanics separately.

## Search behavior

Global search ignores capitalization and searches the six supported fields plus the combined first/last name. Exact field/full-name matches and literal partial matches come before approximate candidates when sorting by relevance. Conservative spelling correction applies to names and workplaces for alphabetic queries of 4–64 characters; short, numeric or punctuation queries stay literal. Email, phone and notes remain literal. Not every misspelling will match.

Name and Workplace filters are case-insensitive literal substring filters; Name checks the combined name. They combine with each other, global search and Email/Phone presence using AND. Presence offers Any, Has value or Missing, where only a nonblank supported string counts as present. Only the observed native `person` native wrapper is read; other unknown native fields are not guessed into those six display fields.

Automatic sorting uses relevance for a nonblank query and newest-created first otherwise. Other choices are Relevance, Name A–Z, Name Z–A, Newest and Oldest; blank names sort last for name sorting, and UUID provides a stable tie. The database filters and ranks the complete saved table before bounded paging. Website pages contain 10 contacts; tool callers retain the existing default 5 and maximum 10. An incomplete page cannot establish absence.

Approximate matches are candidates, never proof of identity or permission. The model must clarify ambiguous people and separately read the exact chosen UUID/version before changing or deleting it. Search does not invoke external Treg, Gmail or Attio. The shared read-only service RPC is `contacts_search`; normal website GET routes retain their authenticated six-field response and accept the optional filters/sort.

The implementation uses PostgreSQL [pg_trgm word similarity](https://www.postgresql.org/docs/current/pgtrgm.html) and a narrowly bounded [edit-distance comparison](https://www.postgresql.org/docs/current/fuzzystrmatch.html). The [Supabase function guidance](https://supabase.com/docs/guides/database/functions) informs its invoker security and private execute grants. Local048is applied as hosted20261026222756_contacts_search. Websitecbfbf5ca includes the shared search/UI/prompt changes; exact hosted assets, privateRPC/auth/filterreads and actual browser states/motion pass. Populated ranking/writes are verified with synthetic persistence, not live mutations.

## Lead routing and Gmail intake

For manual chat requests, Contacts is the default CRM for people, leads and prospects. Attio requires an explicit current-user request; unavailable Contacts is not a reason to silently write to Attio. Existing user intent, ambiguity, exact-read/version and confirmed-receipt checks still apply.

Automatic Gmail INBOX sender intake is separate: it stages only email and optional plain display name in private `contacts_cache` with id and created_at. That flow never promotes rows into Contacts. It does not store mail bodies/provenance in this table or capture outgoing recipients. See the cache milestone for verified deployment and processing limits.

## Manual Contacts interface

The icon-only pastel person avatar beside Ask Tech@NYU opens a native Contacts dialog. Desktop has a searchable list and detail/editor pane; small screens switch between list and detail with All contacts. Search, count and Load more remain visible while rows scroll. The avatar follows the @logo's hover/visible-keyboard-focus color motion; pointer-restored focus stays static and has a static reduced-motion version. Its accessible name is Open contacts.

The approved screen keeps all six saved fields directly editable in small recessed boxes, with a larger Notes textarea. Save/Cancel appear when an existing contact changes; there is no Edit button. The avatar/name/workplace remain above the fields, with a red square × that opens exact-person deletion confirmation. Search is recessed, avatars and gray Load more are softly raised, and no sample footer or subtitle appears. The screen provides six-field creation, partial edits and clearing. Drafts survive save failures and conflict-reload retries. It uses authenticated same-origin HTTP routes without calling the model:

| Route | Operation |
| --- | --- |
| `GET /api/contacts` | Bounded search/list using query, limit and offset |
| `GET /api/contacts/:id` | Read one exact contact |
| `POST /api/contacts` | Create from fields |
| `PATCH /api/contacts/:id` | Change fields using expectedUpdatedAt |
| `DELETE /api/contacts/:id` | Delete that exact version using expectedUpdatedAt |

Browser responses expose id, created_at, updated_at and a fields object containing only the six supported strings. Existing unsupported/legacy JSON is kept server-side and preserved by edits. Routes use the existing private session/Origin checks and do not depend on Discord availability. Contacts remain out of browser storage and caches.

UI/API mutation verification uses actual browser→Vite→Hono→store operations with simulated persistence. Earlier actual local configured database reads succeeded; hosted mutations are not claimed. The [style guide](style-design.md) records the visual specifications. The approved UI and compatible routes are now deployed on the website. Actual authenticated list/search and exact built asset readback pass; independent authenticated hosted Chrome also verifies the ready empty list and six-field Add contact form without writing. See the milestone for the release ID and limitations.

## Treg people-search import

The [Treg integration](treg-contacts.md) adds an authenticated backend request that searches one bounded page and inserts complete raw person records directly into `contacts.raw_input`. Native extra/nested fields and nonstring values remain saved; the normal API and screen expose only the six supported projected strings, including supported native `person` values. Identity matching is separate from storage, and unknown schemas are retained with a stable raw-record fallback. Imports never overwrite existing leads or human edits. Full request/response/import logs stay private, with secrets removed and seven-day retention. The HTTP import operation is separate from `search_treg_people` and `enrich_treg_people`, which perform lookups only. Chat chooses the separate `import_treg_contacts` tool to save their full native successful results by default, unless explicitly told not to save. Private token setup and live-verification limitations are in the guide and rolling milestone.

## Native-field schema upgrade

Migration051, applied as hosted20261027145509_contacts_native_fields, adds nullable `lookup_email`, the private `contact_fields` projection and `contacts_match_email` read RPC, and updates full-table search and atomic enrichment completion. It does not rewrite existing contacts or cache. An existing imported email may be restored only with separate user authorization and an exact completed receipt/current-cache fingerprint; preserve the native JSON and do not fetch or repeat enrichment. Hosted migration/recovery/release state is recorded in the milestone.

October27 live correction:051 is applied; both authorized existing lookup emails are restored separately with exact raw/cache preservation. Website ca6f36ad verifies names/emails/search and the requested loading-selection/idle-avatar behavior through authenticated Chrome/API. Details and limits remain in the rolling milestone.

## Flock it! and selected contact context

Flock it! beside the profile delete control opens Flock with that saved Contact selected. Its prompt chip shows only first and last name and can be removed or replaced. Existing contact edits, assistant text and attached files survive the handoff; the button neither saves nor sends anything.

User messages may carry a bounded `contactContext` containing exactly `id`, `first_name` and `last_name`. The browser captures it separately for each queued message and keeps it in in-memory history, retries and matching-subject steering. Different subjects stay queued for separate replies. It is not a profile copy or verified person identity.

The server validates the selector and includes it only in labelled model-facing copies. Original user text stays unchanged for write authorization. The model may independently choose `read_contact` for details of the exact saved UUID; selection triggers no hidden provider/source read and grants no permission to edit. Names remain untrusted labels. Missing/deleted records are reported honestly. Public chips/history text never show the UUID or full profile, and no new source-content logging or durable browser storage is added.

The directory refresh control reloads saved Contacts while preserving the current search, filters, selected detail and unsaved draft. It performs no contact write or model call. Current implementation, real-model and hosted verification live in the milestone.

The split layout, Flock it! context and directory Refresh are live in website df287ac5. Actual authenticated UI checks and bounded configured-model checks are recorded separately in the rolling milestone; no saved contact changes were made for verification.
