# Attio service client

`config.js` reads a server-only bearer token, one source UUID and explicit allowed object slugs. Empty or invalid object scope disables the integration. Writes require the separate `ATTIO_WRITES_ENABLED=true` opt-in. No default CRM objects are granted.

`client.js` searches, reads, discovers attributes, creates and patches records through the fixed HTTPS Attio v2 origin. Requests reject redirects, inherit cancellation, have a bounded deadline and cap responses at one MiB. Record UUIDs and returned identities are checked; original `app.attio.com` URLs are preserved when supplied, never synthesized. Write values accept bounded JSON with safe attribute slugs and reject prototype keys, excessive nesting and oversized content.

Search uses Attio's fuzzy record search and cannot establish absence. PATCH replaces scalar values and appends multiselect values; deletion, schema changes, list entries, overwrite semantics and autonomous scheduling are outside this module. Writes are never retried. A dispatched write with an uncertain response returns `write_outcome_unknown`, because it may have committed remotely. Errors never include upstream messages, request values or credentials. No persistent CRM cache or model audit retrieval is introduced.
