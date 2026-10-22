# Queue reliability independently accepted

- Local timestamp / role / milestone: 2026-10-21T12:55:34.243956-04:00 / evaluator / harness reliability.
- Requested scope/starting state: bounded failure recovery from approved contract; other sessions' chat/collector changes preserved.
- Work, decisions and evidence: Read-only evaluator finds no unresolved material defects in frozen implementation. Independently41queue/Calendar and23real map SQL tests pass. Verified upgrade preserves pre036active lease/originals, expiry settles once, source/hash/stale fences, source-only grants and no duplicate Calendar/map creation. Fixed test-only nondeterministic singleton selection assumption. Apply036before worker rollout; no hosted execution claimed.
- Files: exclusive queue implementation/SQL/docs for coder; evaluator read-only. Parent serialized journal integration.
- Acceptance: local implementation/review accepted, full regression/build integration pending.
- Limits/handoff: no hosted migration, model/source calls or deployment. Maintenance requires scoped worker polling; expired modified replacement bodies receive quarantine_changed metadata and remain untouched for private service review. Action receipts remain; changed grouping relies also on deterministic source identity/CAS, not an exactly-once claim.
