# Exa default hosted accepted

- Local timestamp / role: 2026-10-27_13-41-18-379994 / evaluator.
- Requested scope: Exa search default and tests of existing selected-provider routes.
- Starting state: reviewed local changes and bounded live tests; unrelated edits preserved.

Independent read-only review accepted the hosted release. Website deployment a60d7107-c2de-4d31-97ca-bc243e4a8dbc is SUCCESS. Migration 054 is recorded once as 20261027173629, with a pinned payload, exclusive dispatch guard and receipt assertions. One guarded hosted search used exa.people.search and returned two names and Google workplaces for $0.007. The database verification ran afterward: all 16 Contacts and 32 raw cache rows retain identical full-row hashes, and the field function retains its owner, invoker mode, empty search path and service-only grants. Frontend hashes, existing Contacts/import/Gmail tools, send readiness, anonymous access denial and all four dormant-route 404s passed. No Contacts import was attempted. The evaluator made no network calls or file changes. No additional calls or corrections are required.

Evidence is private under ignored `evidence/treg-exa-release/`, `evidence/treg-exa-default/` and `evidence/treg-built-route-benchmark/`. Personal result values and credentials are excluded from this journal.
