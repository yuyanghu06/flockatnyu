# M36 collector cleanup scope

- Local timestamp / acting role / milestone: 2026-10-17_14-43-51-647335 America/New_York / planner / M36.
- Requested scope: autonomous collector cleanup with blacklist preservation; no archive.
- Starting state: dirty concurrent workspace; preserved pre-cleanup snapshot: [2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md](2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md).
- Work performed / checks: User authorized removing retired Discord production code, concise docs and isolated collectors. Later confirmed a live new/edit/delete listener and all guild channels except blacklisted categories/channels and their threads. No archive backfill, Gmail enable-flag redesign, Calendar writes or map changes.
- Decisions: existing Railway services remain separate and share Supabase. Applied SQL and historical evidence are immutable. Parent serializes integration and journal writes.
- Resulting state: local work recorded; M36 not complete until independent acceptance and hosted verification.
- Remaining work: forward manual-disable fix, listener regression/evaluation, safe collector deployment and actual service checks.
