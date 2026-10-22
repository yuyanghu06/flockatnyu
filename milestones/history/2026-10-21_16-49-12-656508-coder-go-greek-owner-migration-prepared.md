# Go Greek owner catalogue migration prepared

- Role/scope: coder; authorized single-row Supabase catalogue registration.
- Files: new migration202610210037_go_greek_building.sql and updated model/removal guide only.
- SQL: transaction and existing map advisory lock; insert683-broadway / Go Greek / exact address alias683Broadway with ON CONFLICT DO NOTHING, then exact metadata guard raising23514 on conflict. Replay preserves updated_at. No grants/schema/functions/activity changes; no dependency on pending036.
- Documentation: distinguishes prepared migration from hosted application, frontend disable from database retirement, and future owner-only cleanup guarded by exact row metadata and zeroevent_buildingslinks. Preserve RESTRICT and retain linked row/events/relations.
- Checks: minimal PGlite execution passes exact insert, idempotence/timestamp preservation, name/alias conflict rollback and unrelated row retention; scoped whitespace passes. Parent inspected frozen SQL and requested independent full-chain testing/review before hosted application.
- Access: Supabase MCP CLI read-only preflight is starting after correcting invocation-only server-disable overrides. No persistent MCP configuration change and no database mutation. Dashboard was read-only and stopped at user steering.
- Next: full-chain tests, pre-apply review, only037viaMCP, hosted preservation/API verification and journal update.
