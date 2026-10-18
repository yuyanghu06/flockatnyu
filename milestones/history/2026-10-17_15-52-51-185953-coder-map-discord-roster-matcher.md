# Map Discord Roster Matcher

- Local timestamp / acting role / milestone: 2026-10-17T15:52:51.185953-04:00 / Coder map_roster_code integrated by orchestrator / map-people-schema.
- Requested scope: Add first/last names, create all avatar people and named map locations, match existing tech@nyu Discord names/IDs.
- Starting repository state: Prior proposal and unrelated concurrent changes preserved; existing integrations/Calendar deferral unchanged.
- Work performed / changed files: Added server/map/{roster,discord-roster}.js,info.md and scripts/map-roster.mjs. Name-only proposals, bounded read-only configured-guild search, conditional service-role identity imports; --apply explicit.
- Decisions: Identity roster is not source membership or evidence of location. Unknown names/ambiguous IDs stay null; do not archive guild directory or source bodies. All application access remains service-only.
- Checks and evidence: ThreeJSsyntax/scoped whitespace PASS; independent14roster checks PASS. Review/test fixes preserve all name fields with CAS, block initial-only/short/glued-prefix ambiguity, preserve string IDs and existing links. No real API calls by coder.
- Resulting state / acceptance: Implementation accepted. No surname inferred from glued username; ambiguous results remain pending.
- Remaining work and handoff: Explicit confirmation for11remaining identities; frontend/agent map tools and current source-policy enforcement require a separate authorized pass. No commit/push requested.
