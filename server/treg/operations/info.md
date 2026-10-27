# Treg people operation service

Model-facing descriptions, parameter guidance and returned instruction notices are maintained under root `prompts/tools/`; these modules keep fixed references, structural schemas and service behavior.

`schema.js` contains unchanged lookup metadata and input schemas. `service.js`
owns the actor-bound request scope, whole-batch validation, paid-call promise
reuse, sequential enrichment, native-result registration and required private
completion/import log callbacks. `projections.js` contains pure supported-field
and usage projection helpers; chat imports those helpers without importing tools.

The API factory binds the backend service to private HTTP operations. The trusted
request context carries the same server-owned Treg result-cache object used by
Contacts. Complete native results, callback functions and paid-client objects stay
below the JSON boundary. Only projected supported fields, safe usage and opaque
resultIds are returned. Lookup and saving remain separate named operations.

## Preserved operation behavior

`schema.js` defines two separate lookup operations to the shared website and Discord chat
runner: `search_treg_people` finds one bounded page of external people, while
`enrich_treg_people` accepts one to ten email addresses and returns an ordered
outcome for each. Treg itself accepts one email per enrichment request. Repeated
addresses and overlapping batches reuse promises within a chat run, including
misses and failed attempts, so replay does not trigger another paid lookup.

`service.js` executes these operations against only the private Treg clients. They never import contacts, read
Gmail, change Contacts or modify `contacts_cache`. The model chooses any subsequent
saved-contact operations as separate tools. Requested Treg discovery/enrichment defaults to saving successful people unless the current user says not to save. Server
configuration controls credentials, costs and provider routing; the model cannot
supply those values. Native responses and completion records remain in private
Treg logs. Model/API results contain only bounded supported contact strings,
safe usage metadata and explicit coverage or per-address outcomes.

In chat, successful logged results also expose opaque `resultId` values. The
complete native person records and private log append functions remain only in
an actor-bound, request-local bridge (`server/treg/result-cache.js`), bounded to
100 records, 200 KB per person and 2 MB total. These references allow the separate
Contacts `import_treg_contacts` tool to save exact native JSON without exposing
it to the model or paying for a second lookup. Misses and errors get no reference;
matched enrichment requires an object in the native raw result. The bridge is
not a durable cache and cannot resolve another run's references.

Search field projection recognizes explicit names from one Exa person entity and an unambiguous current employer. Raw Exa rows stay private and unchanged for separate Contacts imports; search still performs only its named lookup.
