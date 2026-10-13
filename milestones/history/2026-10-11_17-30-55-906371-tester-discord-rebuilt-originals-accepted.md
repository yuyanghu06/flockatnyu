# M18 rebuilt originals independently accepted

- Local timestamp / acting role / milestone: 2026-10-11T17:30:55.906371-04:00 / independent tester / M18.
- Requested scope: Read-only aggregate verification of hosted originals, checkpoints, policy and permissions.
- Starting repository state: Collection finished; grouping timed out and rolled back; Railway remains paused.
- Work performed / changed files: Tester wrote evidence/m18-discord-memory/live-storage-report.md with exact SELECT queries/results. Root inspected report and serialized journals. No database/Discord/Railway mutations by tester.
- Decisions: Accept raw rebuild independently; keep grouping and overall hosted completion pending.
- Checks and evidence: 108828 unique originals,213nonempty sources, earliest2024-02-04T18:53:18.480Z/latest2026-10-11T20:33:07.676Z. Zero identity/scope/timestamp/content/citation/hash/foreign-payload/vector/image mismatches. All216 enabled sources succeeded at exact2026-10-11T21:02:08.697Z, no cursors/windows/missing checkpoints. Complete266-node discovery;30visible blacklisted nodes ineligible.17forcedRLS tables/25invokerRPCs with no browser access,1operator,0reader grants; unknown/incomplete discovery fails closed.
- Resulting state / acceptance: Raw originals/checkpoints/policy/catalogue PASS; groups remain0after atomic timeout rollback.
- Remaining work and handoff: Review/test/apply004 performance fix; classify and independently verify exclusive tiers/source ACLs; deploy and verify hosted worker before cron restoration.
