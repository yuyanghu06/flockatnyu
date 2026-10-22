# Queue reliability independently verified

- Local timestamp / role / milestone: 2026-10-21T12:54:57.883771-04:00 / tester / harness reliability.
- Scope: independent provider and queue acceptance; actual SQL in PGlite with synthetic provider/source transports.
- Files changed: new tests/provider-retries.test.mjs, tests/automation-reliability.test.mjs, tests/automation-reliability-sql.test.mjs. Historical tests/audit tests unchanged.
- Findings fixed:3provider rejected-body cleanup hangs fixed by coder; evaluator found random singleton-order assumption in SQL test, corrected by separate fresh two-item partial-finish fixture.
- Checks: provider88pass; combined affected216pass before fixture-only correction; node --test tests/automation-reliability-sql.test.mjs tests/automation-reliability.test.mjs tests/calendar-tools.test.mjs final41pass/0fail. Scoped diff check passed.
- Decision/result: Independent queue acceptance passes:25new runtime/real-SQL checks cover full001–036chain, legacy active lease preservation, singleton retries, fair lanes, five-failure quarantine,24-hour expiry, scoped requeue, stale/snapshot fences and cancellation. Actual Calendar client sees changed batch-derived action keys but creates exactly one event. Final41queue/Calendar checks pass; combined216affected checks passed before fixture-only nondeterministic-order correction. No hosted writes.
- Limitations: no new real-map regrouping integration test; existing map authorization tests passed and database source identity uniqueness independently reviewed. No live model/source/schema/deployment checks.
- Handoff: tests frozen; parent full suite/build underway; queue evaluation and journal integration remain.
