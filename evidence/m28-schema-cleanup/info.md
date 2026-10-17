# M28 schema cleanup evidence

Sanitized database metadata, fingerprints and deployment receipts. No credentials
or original message/document content are retained here. Local fixtures are synthetic.

- local-tests.log and tester-report.md: initial independent cleanup acceptance.
- policy-rename-* and shared-access-*: independent later rename/shared-access tests.
- before.json / after.json / preservation.json: 013/014 hosted preservation.
- before_shared.json / after_shared.json / shared-access-preservation.json: 016 hosted preservation.
- apply13–16-receipt.json and hosted-migrations.json: controlled migration receipts.
- hosted-smoke.json and shared-access-hosted-smoke.json: real service RPC checks without model calls.
- root-discord-final.log / root-integration-final.log: final broad regression runs.

Final expected schema: 19 service-only, forced-RLS tables; Miro data remains JSONB
with 12 columns. Shared source scope and backend administrative checks replace
per-person memberships. Miro ingestion remains paused pending board authorization.
