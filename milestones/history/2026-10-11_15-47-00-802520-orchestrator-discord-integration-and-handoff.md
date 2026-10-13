# Discord integration and handoff

- Timestamp / role / milestone: 2026-10-11T15:47:00.802520-04:00 / orchestrator / M16.
- Scope: local Discord archive, admin and assistant retrieval implementation.
- Work/evidence/state: Integrated Hono admin/search routes, validated model-selected retrieval planning, optional semantic query encoding, server runtime and one-shot worker entry, admin page/client/CSS, frontend request budgets, package/lock/env settings and setup docs. npm run build:api and npm run build passed; unconfigured worker injected env={} returned truthful storage_not_configured no-op. Inspected test evidence and desktop browser capture; git diff --check clean. Removed the new legacy Railway JSON template after current primary docs showed deprecation; future service dashboard/IaC instructions preserve cron/start/build/no-healthcheck settings. Updated source/schema/root/docs guides and current backend notes. Changes remain local/uncommitted on codex/dev. No deployment, hosted schema apply, live archive/backfill or paid model call.
- Decisions: original JSONB records remain authoritative; text/date/author search default, vectors optional; summaries retain originals when later implemented.
- Handoff: live launch needs selected guild/channels, runtime credentials, hosted migration verification and real member/channel access policy.
