# Treg people search into Contacts

This backend integration searches through Treg’s fixed Exa people-search endpoint for one bounded page of people and inserts complete raw person records directly into the private `contacts` table. It does not call a model. The Contacts screen continues to use its existing saved-data API. Separate chat lookup tools are described below; chat saves through its own separate Contacts import tool.

Implementation and verification status live in the [milestone snapshot](../milestones/milestone.md). Building the integration does not activate paid searches: a private server token is required.

## Separate agent lookup tools

Website and Discord chat share two individual Treg tools:

- `search_treg_people` accepts `q`, `company_domain`, `title`, `full_name`, `country`, `location`, `keywords` and `limit`. It searches one page, defaulting to five people and allowing at most ten. At least one of `q`, `company_domain`, `title` or `full_name` is required. A bounded or empty page does not prove no matching people exist.
- `enrich_treg_people` accepts `{emails: ["person@example.com"]}` with one to ten literal email addresses. Treg's routed endpoint accepts one email per request, so the tool makes separate requests and returns a match, miss or error for each input address in order. Case-insensitive duplicates reuse the same lookup within that chat request, including overlapping batches and failed results.

Each lookup tool performs only its named Treg lookup. Neither reads Gmail or sender cache, imports contacts, updates saved data, or invokes another service. Saved-contact questions continue to use `search_contacts` and `read_contact`. Explicit Treg searches and requests to discover new external people use the separate search tool. The model chooses whether email enrichment is necessary; search never automatically enriches its results. To find and enrich people at a company, the model searches first, enriches actual returned email addresses, then saves the richer matches. People without an email or with unsuccessful enrichment can still be saved from their original search results. Plain discovery does not require another paid enrichment call. Clarify a missing email or an unclear distinction between saved contacts and new prospect discovery.

Tool results contain the six explicitly supplied supported string contact fields in `fields`, plus bounded coverage, match/error outcomes and safe provider/call/cost information. In a chat run, successful people also carry opaque `resultId` UUIDs referencing native data held only in that run’s private server memory. Missing fields remain absent; no name is split from `full_name`, no company object is guessed into a workplace, and no saved-contact UUID or timestamp is invented. A real match can have no supported display fields. Provider values remain untrusted data and cannot authorize saving or other actions.

Full provider bodies remain in the existing private full-call logs. Tool results, model tool context and authenticated direct-tool responses exclude raw provider envelopes, log handles, functions, private log paths and arbitrary upstream errors. Ordinary run/tool audit and streamed execution metadata contain no lookup field values. Lookup outcomes explicitly record that the lookup itself saved nothing. A later separate Contacts import appends its exact attempt and outcome to the same private call log. The existing HTTP import route below remains a distinct operation.

The private token, per-upstream-request cost ceiling and disabled automatic provider fallback apply to both tools. With the default $0.10 ceiling, ten distinct email addresses can authorize up to ten separately billed requests (up to $1 in that batch). A miss may still be billed. Backend-generated request IDs and request-local result reuse avoid duplicate calls within one chat request; a new chat request is a new lookup. Current test and deployment state is recorded in the milestone, not implied by this interface description.

## Default chat saving

A current request to discover people through Treg or enrich known people includes saving successful people into this app’s Contacts table by default. An explicit current “don’t save,” preview or read-only instruction takes precedence. Company requests here mean people working at companies; the company-enrichment API stays inactive.

The model separately calls `import_treg_contacts` with one to ten returned result IDs. This Contacts-only tool makes no provider request. It resolves already observed, authenticated, run-bound results from private memory and inserts each complete native person unchanged, including unknown formats with no supported display fields. Search saves the native returned person; enrichment saves its native `.raw` object. The exact enrichment lookup email is retained separately as `lookup_email`, without modifying the provider JSON. Model-supplied profile JSON is never accepted as an import.

Import is insert-only: existing contacts and human edits stay unchanged. Confirmed outcomes distinguish newly imported records from existing records. Ordinary `create_contact`, `read_contact`, `update_contact` and `delete_contact` remain separate tools; edits and deletion still require an exact read and update timestamp. Do not use manual creation to copy a projected Treg profile. Failed lookups/misses have no savable result reference. A result ID alone does not establish saving; only confirmed import items do. Repeated results reuse request-local receipts, and uncertain writes stop further writes.

The temporary registry holds at most 100 people and 2 MB per chat run, with a 200 KB per-person limit, and expires with the run. Neither native objects nor private log handles enter model context or ordinary audit. This is not a cross-chat saved-result cache; rerunning discovery can incur another paid lookup. Actual verification and release status lives in the rolling milestone.

## Exa search provider

People search uses the fixed `exa.people.search` endpoint through Treg. The app includes every supplied search criterion in Exa’s text query, requests the selected result limit and makes one request without provider fallback. Email/profile enrichment and the daily Tomba/Apollo service retain their separate provider policies.

Native Exa result objects remain unchanged in private lookup storage and Contacts imports. Read-only field projection recognizes explicit `firstName` and `lastName` from exactly one person entity. It displays a workplace only when exactly one current job is present and that job supplies a company name. Multiple current jobs, missing fields and unknown formats stay unavailable. Existing manual fields and explicit clears take precedence. JavaScript and migration054’s SQL reader use the same rules; no saved provider JSON or existing row is rewritten.

## Private server setup

Set `TREG_TOKEN` in the backend's private environment. An organization-scoped token is preferred. Set `TREG_ORG` only if the token needs an explicit organization. Existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configure contact storage. Never use a `VITE_` variable for these secrets or put a token into a request body, browser bundle or committed file.

`TREG_MAX_COST_USD` sets the ceiling sent to Treg for each search: default `$0.10`, positive values up to `$1` with at most six decimal places. No automatic pagination, enrichment or retry occurs. Treg's catalog currently warns that some providers bill misses; an empty result is not a guarantee of no charge. Returned usage records the call ID, provider and observed micro-USD cost (one million micro-USD is one US dollar). This integration does not implement customer billing or top-ups.

## Request

From an authenticated same-origin website session, send `POST /api/contacts/import/treg` with `Content-Type: application/json`:

```json
{
  "requestId": "89a443a7-c8a0-4c94-891f-40113cc83386",
  "query": {
    "company_domain": "example.com",
    "title": "engineering",
    "limit": 5
  }
}
```

Use a new UUID for a new search, and retain the same UUID and query when checking an interrupted request. Accepted public search keys remain: `q`, `company_domain`, `title`, `full_name`, `country`, `location`, `keywords` and `limit`. At least one meaningful search selector is required. The backend defaults to five results and limits page size to ten; it does not import a complete provider catalogue.

This is a mutation: a successful request saves contacts immediately. It requires the existing website authentication and Origin protections, independently of Discord access. Responses are private and are not cached. A caller cannot supply a token, provider URL, billing tag, arbitrary contact fields or a client-controlled cost ceiling.

## Stored information and preservation

Each returned Treg person object is saved unchanged as `contacts.raw_input`. Native field names, nested profile data, extra fields, missing fields, nulls and objects remain as supplied. Importing does not inject empty contact fields, replace original values or add metadata keys to the provider object. Full call/provenance data lives in the separate private call log.

The Contacts API and screen display only six supported string fields: `first_name`, `last_name`, `email`, `phone_number`, `workplace` and `notes`. Other values remain saved but hidden. The observed native `{person: {...}}` (with `found` absent or true) wrapper supplies these fields when no explicit top-level manual field exists. Explicit Exa names and an unambiguous current company are also read using the rules above. The verified lookup email, when separately retained as `contacts.lookup_email`, supplies email only when omitted by the provider and not explicitly overridden or cleared. No raw fields are renamed, flattened or injected. Unknown shapes remain retained without guessed values. Ordinary user edits change only requested fields and preserve the rest of the saved JSON.

Identity checks can read recognizable provider names, emails or profile IDs without changing the saved record. Strong identifiers drive repeat-import protection. When no supported strong identity exists, a stable hash of the provider and complete raw record prevents identical repeats. A changed raw record can therefore create another lead rather than be guessed to be the same person. Valid unknown formats are saved instead of being dropped because display fields are unavailable.

Imports insert new records only. Existing UUID conflicts and exact email matches preserve the entire existing row, including human edits. No prior contacts are migrated, rewritten or backfilled by this change. This is conservative duplicate prevention, not a person-matching or automatic merging system.

## Results and failures

The result counts imported, existing and skipped rows, returns projected contact data and includes safe usage metadata. Only a confirmed insertion counts as imported. Upstream errors, unavailable configuration, malformed results and empty pages cannot create invented contacts. The entire upstream page is validated before inserts begin.

Database operations are individual inserts, so a later failure can leave earlier contacts saved. Partial results retain confirmed progress; an uncertain database response is reported as an unknown write outcome. Do not claim a whole batch was saved or blindly repeat uncertain operations. Raw provider errors, account balances and secrets are never passed through to the caller.

## Private full-call logs

The user requested full Treg call logging on October 26, 2026. The six-field contact object shown in chat is our saved-contact projection. Its UUID and timestamps come from our database; the original Treg body can contain additional person data, raw provider output, routing information and errors.

Each actual lookup attempt has a private log with the effective request body and safe metadata, the bounded complete upstream response, and the final contact-import outcome. Logs include errors and partial outcomes. Tokens, authentication/cookie headers, known configured secret values and credential-bearing keys are removed. Ordinary contact values remain in this explicitly authorized private log. Raw exception text is not recorded.

Development logs default to ignored `.local/treg-calls/`; production logs default to `/data/treg-calls/` on the existing private persistent volume. `TREG_CALL_LOG_DIR` can select a private directory. Directories use mode `0700` and log files `0600`, allowing only the service account to access them. No website endpoint or model tool reads logs, and complete bodies do not go to console output. Inspect them only through authorized private filesystem/hosting access; never copy real log contents into committed evidence.

Logs expire after seven days. Cleanup runs when new attempts start and advances through at most 1,000 directory entries per attempt, so a large directory can take several attempts to sweep. Each request must be durably logged before a paid lookup. The upstream response must be logged before contact writes. A logging failure at either stage stops further work. If final outcome logging fails after contacts were confirmed saved, the API preserves those confirmed receipts and explicitly reports the logging failure; it does not claim the saves failed or blindly repeat them. A crash can leave an unfinished log.

The existing 512,000-byte upstream response limit remains. Deep data beyond the logger’s nesting limit is explicitly marked incomplete; interruption while reading is also marked incomplete. Oversized responses keep only a bounded prefix with explicit incomplete/truncated metadata, and create no contacts. Unknown credentials in provider prose cannot be guaranteed detectable; logging uses credential-key/pattern removal and known-secret scrubbing rather than promising every arbitrary string is safe.

This log is separate from the existing model audit. General model-audit and other service logging restrictions remain unchanged. Current implementation, test evidence and activation status remain in the milestone snapshot.

## Verification

Run `node --test tests/treg-call-log.test.mjs tests/treg-contacts.test.mjs tests/contacts-http.test.mjs tests/contacts-tools.test.mjs` for the independent HTTP/client/store checks and Contacts regressions. These use simulated Treg and PostgREST responses with the production adapters; they do not read or change live contacts or incur lookup charges. API/frontend builds and actual production-package inclusion are separate checks. These checks do not establish a paid provider lookup or hosted import; current private configuration and activation status are recorded in the milestone.

## Official contracts

The [live routed endpoint catalog](https://treg.to/catalog/endpoints/treg.people.search) documents the search body, provider-native output and routing headers. The [Treg product integration guide](https://treg.to/integrate.md) documents REST token authentication, backend usage tags, idempotency and cost headers. The [official examples](https://github.com/superdesigndev/treg/tree/main/src/treg/catalog/examples) provide concrete provider shapes. These sources were inspected on October 26, 2026; no live paid response has been verified for this implementation.

## Hosted lookup trial — October 26

Web deployment 301ed08a-daf8-4159-8bd5-ac88c1d49200 is live with separate lookup tools. The first authorized lookup was refused because the selected Flock@NYU Treg team had no credit; that evidence remains preserved. After the user added credit, one fresh hosted lookup completed successfully. The selected BlitzAPI provider returned no matching profile. Read-only billing records matched the returned call ID and confirmed $0 charged for both routed and provider calls; team balance remained $10. No Contacts import/cache write or further lookup occurred. This is a selected-provider miss, not evidence of absence across all providers. Jev is not used. Private evidence and independent acceptance are linked from the milestone.

## CSV email-only trial

A user-authorized CSV trial processed2,361unique valid emails in ten-address batches through the existing hosted lookup API. BlitzAPI returned14profile matches and2,347misses. Thirty client-lost responses received one controlled retry within a shared$10ceiling; final balance reconciled total charges of$0.008415, including the original attempts. No Contacts/cache writes, search or provider fallback occurred. Results are the tool's supported-field projection, not a native Contact import. Private evidence and independent acceptance live in the milestone journal.

## Default-save verification

Eight focused offline groups verify exact raw imports, separate lookup email, scoped references, existing human data, versioned editing/deletion, replay, uncertainty, logging and memory limits. Real configured gpt-6-luna evaluation used 32 HTTP inference requests with simulated Treg/Contacts and no business-service network. Five distinct workflows have accepted evidence; a combined CRUD case applied correct exact-version changes but reached its per-case cap before the final answer. An intermediate compatibility fix interrupted the first source-pinned report; the reviewed difference preserves the Treg-enabled path, and final-source search/save plus uncertain-write answer checks passed. These checks do not establish a paid Treg response or production Contacts mutation. Current release status is in the milestone.

Website release `8455304f-0bdf-403f-a6c8-e59fd626baae` is SUCCESS. Read-only authenticated hosted verification confirms Contacts CRUD and `import_treg_contacts` registration, read-only Treg lookup tools, unchanged frontend hashes and existing Gmail-send readiness. No paid lookup, model request or business write was used for hosted verification.
