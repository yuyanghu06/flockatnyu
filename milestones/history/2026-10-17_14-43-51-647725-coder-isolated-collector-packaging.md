# M36 isolated collector packaging

- Local timestamp / acting role / milestone: 2026-10-17_14-43-51-647725 America/New_York / coder / M36.
- Requested scope: autonomous collector cleanup with blacklist preservation; no archive.
- Starting state: dirty concurrent workspace; preserved pre-cleanup snapshot: [2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md](2026-10-17_14-43-51-646507-orchestrator-pre-cleanup-snapshot.md).
- Work performed / checks: Deployment specialist implemented minimal validated static import closures, pinned separate manifests/locks, strict Docker inputs and explicit continuous-service config. Discord12modules/15 dependency packages; Gmail11modules/26packages. Node22 packaging7/7, isolated npm ci, import/disabled smoke and whitespace pass. No cloud mutation in specialist pass.
- Decisions: existing Railway services remain separate and share Supabase. Applied SQL and historical evidence are immutable. Parent serializes integration and journal writes.
- Resulting state: local work recorded; M36 not complete until independent acceptance and hosted verification.
- Remaining work: forward manual-disable fix, listener regression/evaluation, safe collector deployment and actual service checks.
