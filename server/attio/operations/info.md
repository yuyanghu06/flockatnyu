# Attio operations behind the private API

Model-facing descriptions, parameter guidance and returned instruction notices are maintained under root `prompts/tools/`; these modules keep fixed references, structural schemas and service behavior.

`contracts.js` declares record search/read/create/update and attribute discovery.
`projection.js` bounds returned records and builds safe source links and failure
diagnostics. `index.js` performs source/object/write validation, calls the
existing Attio client and holds each chat request's exact reads, mutation
receipts, input revision and uncertain-write stop.

The private operation API dispatches to these operations. `tools/attio/index.js`
only exposes compatible metadata and API-client construction. Keep exact-read
permits and write receipts in backend request state; JSON arguments cannot create
them. Preserve requested-field writes, incomplete fuzzy-search coverage and safe
unknown-write reporting. No deletes, schema changes or cross-request CRM archive
are part of this service.
