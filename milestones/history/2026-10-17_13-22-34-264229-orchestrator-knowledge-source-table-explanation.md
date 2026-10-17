# Knowledge source registry clarification

- Local timestamp / acting role / milestone: 2026-10-17_13-22-34-264229; orchestrator; M33 context only.
- Requested scope: explain the Supabase knowledge_sources table.
- Starting repository state: existing dirty workspace; M33 local migration verification pending in the rolling snapshot.
- Work performed / changed files: inspected current instructions, journal, database guide, migrations001/012/014/016/017 and Miro runtime references; only journal documentation changed.
- Decisions: knowledge_sources stores source identity/metadata/status, with Miro board data stored separately and referenced by source_id. Discord source identities moved into discord_view_policies by017. No new implementation scope.
- Checks and evidence: local schema and authorization function inspection; no callable Supabase tools exposed and no live database query performed. No application tests needed for explanation-only scope.
- Resulting state / acceptance: explanation grounded in local code; no schema, runtime, source scope, deployment or credentials changed.
- Remaining work and handoff: preserve existing M33 tasks and verification status; this pass does not accept or apply018.
