# Saved Contacts

`store.js` performs saved Contacts reads, exact-version edits, deletion and insert-only imports. `search.js` validates search/filter/sort options and provides the saved-data search adapter. `fields.js` reads only the supported displayed values from complete native raw contact records. `summary.js` validates the separate directory shape: ID, timestamps and six display strings, with no raw profile.

These modules never fetch a provider or source original. Treg clients and imports live in `server/treg`; their explicit importer passes native records here without rewriting them. Browser HTTP handlers live under `src/api/contacts`, and model tools live under `tools/contacts`. Preserve human edits, raw JSON, explicit clears, identity decisions and uncertain-write outcomes.

Directory and chat search call the service-only `contacts_search_fields` SQL function. It preserves existing ranking, filters and extra-row paging inside the database while returning only directory fields across the network. Exact reads, imports and version-checked edits continue to use complete native records; a search summary never authorizes an edit.
