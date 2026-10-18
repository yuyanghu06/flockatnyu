# Map Schema And Avatar Seeds

- Local timestamp / acting role / milestone: 2026-10-17T15:52:51.185952-04:00 / Coder map_schema_code integrated by orchestrator / map-people-schema.
- Requested scope: Add first/last names, create all avatar people and named map locations, match existing tech@nyu Discord names/IDs.
- Starting repository state: Prior proposal and unrelated concurrent changes preserved; existing integrations/Calendar deferral unchanged.
- Work performed / changed files: Added only202610170021_map_people_buildings.sql:two forced-RLS tables, first/last/Discord-display fields, deterministic26avatar/nine location seeds, five invoker validation/guard/move/read functions.
- Decisions: Identity roster is not source membership or evidence of location. Unknown names/ambiguous IDs stay null; do not archive guild directory or source bodies. All application access remains service-only.
- Checks and evidence: Coder real PGlite001–021 and whitespace PASS; prior table/function metadata unchanged, invalid JSON/references rejected, move/rollback/planned-state preservation and expiry/identity guards verified.
- Resulting state / acceptance: Implementation accepted;021later applied and now immutable. Source policy remains future backend responsibility.
- Remaining work and handoff: Explicit confirmation for11remaining identities; frontend/agent map tools and current source-policy enforcement require a separate authorized pass. No commit/push requested.
