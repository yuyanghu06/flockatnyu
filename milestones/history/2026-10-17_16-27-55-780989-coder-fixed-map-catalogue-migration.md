# Fixed map catalogue migration

- Local timestamp / acting role / milestone: 2026-10-17T16:27:55.780989-04:00; coder; map-building-write-scope.
- Requested scope: restrict runtime building writes to people_here.
- Starting state: existing migration021 immutable; broader runtime grant still live.
- Work performed: coder added202610170022_map_buildings_people_here_only.sql and appended migration guide; no other edits/cloud calls.
- Decisions: revoke INSERT/UPDATE/DELETE at table level and explicit UPDATE grants on allfivecolumns, then grant UPDATE(people_here) only. Retain SELECT/RPC, forced RLS and internal updated_at trigger; notify schema reload.
- Checks and evidence: scoped whitespacePASS; noSQLexecution claimed by coder.
- Resulting state / acceptance: migration ready for independent tests/review, not yet hosted.
- Remaining work and handoff: tester verifies directwrites/RPCmoves/catalogue denial; primary owns cloud application and journal.
