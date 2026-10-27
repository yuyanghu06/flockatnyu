# Dormant Treg routes scoped

- Local timestamp / acting role / milestone: 2026-10-26T19:17:09.085067-04:00 / orchestrator / treg-dormant-routes.
- Requested scope: Build email finding, email verification, phone finding and company enrichment routes without exposing them to model tools or other runtime callers. User explicitly retains current no-fallback enrichment.
- Starting repository state: Existing Treg search/email enrichment tools are live in website release 301ed08a. Funded hosted trial produced a selected-provider miss without charge. Broad unrelated and concurrent changes preserved.
- Work performed / changed files: Read startup tracking, role configs and existing Treg/auth/logging code. Assigned read-only planner official-contract research and independent tester preparation, with exclusive ownership and no child agents. Added milestone scope, current tracking and explicit preference note.
- Decisions: New handlers remain exported but unregistered; no app/runtime imports, tools, UI, worker, deploy or database writes. Preserve existing clients and no-fallback header. No new prompt/model testing or paid calls needed.
- Checks and evidence: Existing main app only registers current Contacts/import tools; existing enrichment uses a fixed endpoint, requestId idempotency, per-call ceiling, no retries/fallback and private logs. Exact four-operation contract remains planner work.
- Resulting state / acceptance: Scoped, implementation not started.
- Remaining work and handoff: Finish official contract plan, implement new files, independently test behavior and dormant boundaries, review/fix and integrate docs.
