# Guarded cleanup and isolated web package prepared

- Local timestamp / acting role / milestone: 2026-10-25T13:55:05.113724-04:00 / orchestrator / go-greek-removal-2026-10-25.
- Requested scope: remove Go Greek from Flock and its attached database entries.
- Starting repository state: unrelated existing documentation and incident journals preserved.
- Work performed / changed files: added forward data migration046; updated affected source/server/test/database guides and historical cleanup documentation; prepared a276-file isolated web package from deployed4f166ae7.
- Decisions: exact identity guard and existing map lock; exclusive activities cascade only their own relationships; shared activities retain event/attendance facts. Shared sources/profiles/types/grants unchanged. No hardcoded generated event IDs or source fetches. User removal request supersedes older no-linked-deletion guidance.
- Checks and evidence: independent PGlite tests pass on real001–045 schema; package comparison verifies only server/map/presence.js and removal of event-preview.js in backend, plus intended frontend chunks. All local worker changes are excluded. Package hashes: evidence/go-greek-removal-2026-10-25/web-package-verification.json.
- Resulting state / acceptance: concrete cleanup SQL and release prepared; no hosted database deletion or web upload yet.
- Remaining work and handoff: finish independent browser/evaluator review; complete pending scoped Supabase write authorization, inspect live exact links/constraints, apply only reviewed046, deploy web and verify actual results.
