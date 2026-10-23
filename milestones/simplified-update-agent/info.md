# Simplified update agent

Goal: interpret authorized cached Discord/Gmail for Calendar changes, then enrich appropriate existing map events with source-backed people/location statements.

Scope: remove worker Miro and broad model reconciliation; preserve completed deterministic Calendar-to-map projection, Member Plans routing and temporary task cache. Exact originals, identities, source access, human edits and lease fencing remain enforced. Mechanical API failures remain visible without becoming model pagination tasks.

Completion: meaningful independent source/flow/failure tests, build, evaluator acceptance, documented implementation and actual release state. No map geometry, new budget values or source permission expansion beyond explicit queued Gmail Calendar support. Parent owns journal and integration; runtime coder and tester have exclusive assignments.

Status: implemented, independently tested/reviewed and deployed to the update-agent service. Live preparation is ready; backlog outcomes and spend improvement are not yet measured. See ../milestone.md for exact release, verification and separate chat-test limitations.
