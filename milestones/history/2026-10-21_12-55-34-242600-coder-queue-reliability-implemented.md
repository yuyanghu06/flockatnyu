# Queue implementation complete

- Local timestamp / role / milestone: 2026-10-21T12:55:34.242600-04:00 / coder / harness reliability.
- Requested scope/starting state: bounded failure recovery from approved contract; other sessions' chat/collector changes preserved.
- Work, decisions and evidence: Implemented036 service-only failure/expiry settlement, fair fresh/singleton retry lanes, five-failure singleton quarantine,24-hour matching-payload cleanup, exact scoped recovery, safe partial finish and legacy unscoped claim revocation. Handler distinguishes caller cancellation from run timeout/lease failure; production failed-settlement RPC never falls back to shutdown release. Coder75focused checks, syntax and diff checks pass. Changed handler/store/automation guide,036and migration guide, docs/agent-automation.md.
- Files: exclusive queue implementation/SQL/docs for coder; evaluator read-only. Parent serialized journal integration.
- Acceptance: local implementation/review accepted, full regression/build integration pending.
- Limits/handoff: no hosted migration, model/source calls or deployment. Maintenance requires scoped worker polling; expired modified replacement bodies receive quarantine_changed metadata and remain untouched for private service review. Action receipts remain; changed grouping relies also on deterministic source identity/CAS, not an exactly-once claim.
