# Treg provider clients and native contact imports

`people.js` calls the fixed Exa people-search endpoint through Treg. It preserves the existing exported factories and validation/identity functions for callers. `validation.js` holds unchanged people-query, configuration and actor bounds. `contact-identity.js` derives contact IDs separately from native raw person records. `contacts-importer.js` performs the explicitly requested search followed by insert-only Contacts imports with exact per-record log outcomes; ordinary tools keep lookup and saving separate.

`enrich.js` enriches supplied email addresses. `lookups.js` contains the existing optional email/phone/company lookup clients. `branddev.js` selects one fixed native company GET variant and projects supported fields. The corresponding HTTP routes remain dormant under `src/api/treg` until explicitly registered.

`call-log.js` privately stores bounded, credential-redacted full Treg calls and import outcomes with the existing retention policy. `result-cache.js` holds short-lived actor/run-bound native lookup results for a separate Contacts import operation.

Do not change provider selection, budgets, retry/fallback policy, logging requirements or route activation as part of file cleanup. Native response JSON and existing human contact edits must remain intact; only the supported field projection is public.
