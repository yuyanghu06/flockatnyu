# Discord SQL and identity fixes

- Timestamp: 2026-10-11T15:43:28.998841-04:00
- Role / milestone: coder / M16.
- Requested scope: resolve local SQL execution/provenance/window findings.
- Changed files: server/discord config/store/sync and local SQL migration.
- Evidence and state: Focused coder fixes add explicit non-null vector model/provider/hash checks, grant service_role usage of the vector extension schema, reject future backfill windows, and validate message source/guild/channel/author/timestamp/link identity. Parent inspected these changes; coder reported 37/37 then-current Discord tests including local PostgreSQL/pgvector fixtures. Independent final regression tests and evaluator review remain pending. No live cloud/source/model operations.
- Remaining: independent final tests and evaluation.
