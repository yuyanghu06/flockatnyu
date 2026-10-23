# Planner saved-task loading

Goal: remove complete-backlog history transfers from worker startup, phase transitions and completion while retaining all existing authorization and proof checks.

Scope: new service-only metadata catalogue and exact-task read RPCs, task-store/pipeline wiring, safe storage diagnostics and focused preservation tests. The orchestrator owns migration, journal and release; runtime and tests have separate writers.

Acceptance: real runner with a realistic large synthetic backlog; correct original bindings, snapshots/versions, scopes, leases, fragments and exact resolution; old/mechanical/untouched work survives. Measure hosted query shapes under existing limits. Final evaluator review precedes release.

Status: implementation in progress. Migration045 is local only; writable hosted migration access has not been established. See the rolling milestone for actual verification and release state.

October23 implementation: all five backlog loads replaced; local PostgreSQL/runner checks and API build pass. Hosted metadata query-shape137tasks/88,583B/722.196ms. Final frozen review and migration/worker release remain pending.

October23 final evaluator accepts catalogue/exact-read release after306frozenchecks and exact local migration receipt/grants. Hosted migration and worker rollout are next; no hosted success is claimed yet.

October23: hosted045/receipt/functionACL/RESTverified; isolatedworkera34ade2f isSUCCESSat19:52:01NewYork. Bothcurrent/frozengates306pass. Ordinaryrunobservation andsourcepublication remain.
