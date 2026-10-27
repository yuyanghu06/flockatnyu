# Treg people search into Contacts

Goal: search Treg from an authenticated backend request and insert actual returned people directly into the existing private contacts table.

Scope: a bounded Treg HTTP client, direct import endpoint, original provider rows plus conservative contact fields, insert-only duplicate protection, safe costs/errors, independent simulated integration tests. No chat prompt, model tool, Contacts screen, worker, database migration or deployment is required by this pass.

Completion requires authenticated HTTP → Treg client → Contacts store behavior checks with simulated upstream/storage, preservation/retry/error cases, API build and production package inclusion, and independent final review. Live provider calls need a privately configured token and are a separate verification limit.

Status: complete locally. Independent tester passed the actual HTTP/client/store integration over simulated services; evaluator ACCEPT. API/frontend builds and actual production package pass. No local token, paid live lookup, hosted import or deployment was verified. The rolling milestone snapshot is authoritative.
