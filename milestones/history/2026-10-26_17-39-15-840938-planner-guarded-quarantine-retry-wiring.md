# Guarded quarantine retry wiring reviewed

- Local timestamp / role / milestone: 2026-10-26T17:39:15.840938-04:00; planner; manual pending work.
- Work / evidence / limits: Confirmed existing read-only scope wiring uses createDiscordStore, readLiveDiscordConfig and resolveDiscordSourceIds without task pruning. The exact quarantined-row payload_hash is the expected 32-character hash for the normal requeue wrapper. Database guards atomically require no active global lease, current unexpired quarantine, allowed matching source and exact current payload hash. Preparation only; no files, live calls or mutations.
- Next action: continue exact supported work and retain genuine blockers; retry helper remains unexecuted.
