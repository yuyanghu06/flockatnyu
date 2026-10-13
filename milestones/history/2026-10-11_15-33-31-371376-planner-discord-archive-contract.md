# Discord archive implementation contract

- Acting role / milestone: planner / M16 Discord archive and retrieval.
- Requested scope: selected Discord channels, January 1 2026 backfill, daily Railway sync, JSONB original messages, optional vectors, website configuration and bounded retrieval tools.
- Starting state: codex/dev; M15 assistant/Hono source, seven-table unapplied knowledge SQL, no live archive; npm install refreshed the lock successfully during orchestration.
- Work performed: independent read-only planner inspected backend, migration, frontend, workflow and permissions. No code changes by planner.
- Decisions: one message per row with JSONB; Discord IDs remain strings; text/date/author search default; embeddings opt-in; raw originals retained, derived weekly/monthly summaries deferred pending retrieval/model design. Daily scans use fixed windows, page checkpoints and successful watermarks. Explicit channel/thread selection and source grants; admin privilege separate from read scope; production auth remains closed.
- Checks: source inspection and primary Discord/Railway documentation only. No database/model/Discord calls or runtime checks.
- Acceptance: ready for local implementation; SQL application, runtime credentials, guild ID, member policy and summary model remain unresolved.
- Handoff: coder owns server/discord and new migration; parent owns integration/admin/docs; tester will exercise pagination, retries, ACL, date filters and Hono.
