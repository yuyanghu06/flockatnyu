# Treg engineer-search comparison planned

- Acting role: independent planner; orchestrator records report.
- Scope: user requested testing available Treg people-search APIs and finding ten engineers across big tech/startups.
- Starting state: many unrelated working-tree changes; live lookup tools are separate from Contacts importer and daily sender enrichment.
- Work: read current tool/client contracts and official current Treg catalog metadata. Root prepared ignored temporary harness; no application edits.
- Decision: hosted default tool plus direct Dropleads, Icypeas, Exa and Apollo; four company queries request Google3/Microsoft2/Anthropic3/Cursor2. Twenty maximum calls with $0.10 each and $2 total reserved, no retries or enrichment/imports.
- Acceptance: planner ACCEPT. Judge current employer/engineering role, complete identity, links, unmasked contacts, errors, actual charges and timing; query filters alone do not verify employment. Apollo can match former employers and masks surnames. Exa requires actual current-job evidence; hosted projection excludes titles/links.
- Evidence: current official endpoint JSON in ignored evidence/treg-search-engineers/catalog-*.json; no paid calls by planner. Independent harness preflight pending.
- Remaining: review harness, execute bounded searches, independently inspect result evidence, report ten supported matches if available. No configuration, source grants, database, daily service or deployment changes.
