# Map Avatar Roster Approved Plan

- Local timestamp / acting role / milestone: 2026-10-17T15:52:51.185951-04:00 / Planner map_people_schema_plan integrated by orchestrator / map-people-schema.
- Requested scope: Add first/last names, create all avatar people and named map locations, match existing tech@nyu Discord names/IDs.
- Starting repository state: Prior proposal and unrelated concurrent changes preserved; existing integrations/Calendar deferral unchanged.
- Work performed / changed files: User authorized creation after proposal, requested first_name/last_name and26avatar rows plus existing-bot name matching. Planner confirmed26filenames/nine selectable IDs, nullable unknown surnames and idempotent seeds.
- Decisions: Identity roster is not source membership or evidence of location. Unknown names/ambiguous IDs stay null; do not archive guild directory or source bodies. All application access remains service-only.
- Checks and evidence: Read-only repository review only; no facial matching, source grants or invented identities. Primary live preflight confirmed exact configured tech@nyu guild,25targeted member-prefix searches200; member-list403 respected. Existing secure Supabase CLI auth authorized read-only Management query confirming five starting tables.
- Resulting state / acceptance: Plan accepted; disjoint SQL, matching and test ownership assigned.
- Remaining work and handoff: Explicit confirmation for11remaining identities; frontend/agent map tools and current source-policy enforcement require a separate authorized pass. No commit/push requested.
