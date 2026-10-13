# M20 summary commands and guide integration

- Local timestamp / acting role / milestone: 2026-10-11T18:06:52.351286-04:00 / orchestrator / M20.
- Requested scope: Integrate user-authorized Luna summary commands and accurate launch documentation.
- Starting repository state: Runner coder complete; storage/tests in progress; M18 replacement job ready and daily cron restored.
- Work performed / changed files: package.json adds preview/run/backfill summary aliases; .env.example documents summary bounds and actual900000ms archive/discovery budgets. Updated server/discord, migration, evidence and milestone guides and docs/discord-launch.md. Preserved unrelated frontend/user changes.
- Decisions: Exact Luna and server-only credentials; separate summary worker preserves collection during model failures; no images/vectors/member grants. Current006 and actual generation remain explicitly pending.
- Checks and evidence: npm run build:api and git diff --check passed. Existing deployment allowlist recursively includes backend JavaScript and excludes environment files; no new allowlist edit needed.
- Resulting state / acceptance: Local integration ready for storage/SQL tests and evaluator review; no hosted006 or Discord model call claimed.
- Remaining work and handoff: Complete independent SQL coverage/scale/race checks and final review; apply006, run real pilot/all manifest and configure separate recurring summary worker.
