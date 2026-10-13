# Discord worker and local schema

- Timestamp: 2026-10-11T15:40:50.316985-04:00
- Role / milestone: coder / M16.
- Requested scope: local Discord archive implementation and verification.
- Evidence and resulting state: Coder implemented five modules under server/discord plus info.md and local migration 202610120002_discord_archive.sql. Parent inspected source, exported contracts and SQL. Syntax checks passed; coder reported 28/28 current Discord fixture tests. Independent testing remains underway. Backward fixed-window scan, atomic progress/watermark, explicit channels/threads, observed JSONB revisions, raw-before-embedding, hash/provenance and source grants are implemented. No historical deletion/full edit reconciliation or summaries; no live calls/deploy.
- Remaining: independent SQL/API/admin verification, review and integration.
