# M36 listener and admin integration

- Local timestamp / acting role / milestone: 2026-10-17_14-43-51-647815 America/New_York / orchestrator / M36.
- Requested scope: autonomous collector cleanup with blacklist preservation; no archive.
- Starting state: dirty concurrent workspace; preserved pre-cleanup snapshot: [2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md](2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md).
- Work performed / checks: Parent added bounded Discord Gateway SDK integration, policy/ancestry authorization and pending-event enqueue, CAS committed-session checkpoint and health/shutdown handling. Removed archive controls and unused knowledge status from admin/API. Shared Gmail flag redesign deferred. API/assistant/provider30/30 pass after explicit timezone fixture correction. Independent review found manual-disable/discovery reenable bug requiring forward020 and metadata/access-loss fixes; no hosted cutover yet.
- Decisions: existing Railway services remain separate and share Supabase. Applied SQL and historical evidence are immutable. Parent serializes integration and journal writes.
- Resulting state: local work recorded; M36 not complete until independent acceptance and hosted verification.
- Remaining work: forward manual-disable fix, listener regression/evaluation, safe collector deployment and actual service checks.
