# Calendar cancellation and map visibility reproduced

- Local timestamp / acting role / milestone: 2026-10-25T13:42:05.954878-04:00 / researcher / map-upsert-diagnosis-2026-10-25 follow-up.
- Requested scope: why the map remains unchanged after a successful chat write; read-only code tracing and offline reproduction.
- Starting repository state: existing documentation and incident evidence preserved; no runtime edits.
- Work performed / changed files: inspected exact Calendar sync, preservation capability and map display code; compared with frozen deployed worker. No files changed or external calls.
- Decisions: Calendar supplies canonical status; chat attendance survives a later cancellation projection but is hidden with its event. Direct chat map writes do not update Calendar.
- Checks and evidence: calendar-sync.js41–53,119–165; frozen events.js274–279; presence.js79. Full cancelled Calendar record and sparse cancellation tombstone, using frozen sync/map/presence modules with in-memory state, both yield one successful map write, cancelled status, exact preserved chat attendance and zero visible event/people/upcoming entries. Sync/presence/source-access match frozen release.
- Resulting state / acceptance: mechanism reproduced; exact production source and timing correlation handed to orchestrator.
- Remaining work and handoff: do not infer Calendar cancellation actor or time from these offline cases.
