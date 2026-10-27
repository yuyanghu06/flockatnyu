# Treg people lookups

`index.js` exposes two separate read tools to the shared website and Discord chat
runner: `search_treg_people` finds one bounded page of external people, while
`enrich_treg_people` accepts one to ten email addresses and returns an ordered
outcome for each. Treg itself accepts one email per enrichment request. Repeated
addresses and overlapping batches reuse promises within a chat run, including
misses and failed attempts, so replay does not trigger another paid lookup.

These tools only call the private Treg clients. They never import contacts, read
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
