# M15 assistant application wiring

Goal: assistant-primary chat UI after entry -> Hono -> configurable streaming model adapters, plus permission-aware Supabase repository/local migrations. Preserve map/load experience. No live source connectors, model requests without credentials, cloud migrations or deployment.

Assignments: backend/app/providers specialist; frontend/chat transport specialist; knowledge/migrations/worker specialist. Root owns shared contracts, package/runtime setup, integration, independent review handoff and journal.

Acceptance: working offline end-to-end protocol with fixtures, streaming/cancel/error/provider switching, safe missing configuration, production failclosed auth and scoped retrieval, no secret browser exposure; local migrations documented unapplied. Browser/live external verification only if available.

Status: incomplete, stopped for the requested dev-branch snapshot. Source includes frontend, backend/provider, repository/migration and worker scaffold. Latest checks: 32 passed, 1 Hono dependency skip. Open review findings: chat aggregate/UTF-8 request budget mismatch and 500-character retrieval query mismatch. Dependency installation/lock update and live Hono/database/browser acceptance remain outstanding. Supabase registration was observed enabled, auth status unknown, no DB response verified; migration unapplied. See ../../docs/assistant-backend.md.
