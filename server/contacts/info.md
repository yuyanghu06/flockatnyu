# Saved Contacts

`store.js` performs saved Contacts reads, exact-version edits, deletion and insert-only imports. `search.js` validates search/filter/sort options and provides the saved-data search adapter. `fields.js` reads only the supported displayed values from complete native raw contact records.

These modules never fetch a provider or source original. Treg clients and imports live in `server/treg`; their explicit importer passes native records here without rewriting them. Browser HTTP handlers live under `src/api/contacts`, and model tools live under `tools/contacts`. Preserve human edits, raw JSON, explicit clears, identity decisions and uncertain-write outcomes.
