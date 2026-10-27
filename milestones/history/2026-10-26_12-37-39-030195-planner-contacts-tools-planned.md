# Contacts model tools planned

- Local timestamp / acting role / milestone: 2026-10-26T12:37:39.030195-04:00 / planner / contacts-tools.
- Requested scope: Separate read/create/edit/delete model tools for first_name,last_name,email,phone_number,workplace,notes; real configured model API verification.
- Starting repository state: Contacts047 live and independently verified. Existing unrelated dirty work preserved.
- Work performed: Independent planner inspected existing tool/store/chat/provider/packaging patterns. Selected five tools: search_contacts, read_contact, create_contact, update_contact, delete_contact. Existing table/ACLs suffice; no new migration.
- Decisions: Six optional string fields, omitted new values empty; omitted edit fields preserved, empty explicitly clears. Exact request-local read and updated_at match before edit/delete, complete raw JSON preserved with conditional PostgREST writes. Safe receipts/statuses and bounded pages. Prompt sequences separate calls; contacts only, no external service reads. Website/Discord chat only, no autonomous CRM harvesting.
- Checks and evidence: Repository inspection only; no external requests/writes in planner pass. Live evaluation will use production runner/adapters and configured inference API with synthetic contacts, hard request cap and inference-only network.
- Resulting state / acceptance: Plan accepted for disjoint implementation and independent tests.
- Remaining work: Implement core tools/store and chat integration, independently test actual behavior and real model, evaluate/fix/integrate. No deployment/real contact writes are needed by this scope.
