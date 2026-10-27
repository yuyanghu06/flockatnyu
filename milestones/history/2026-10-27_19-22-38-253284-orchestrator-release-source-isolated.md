# Prompt release isolated without unrelated Calendar changes

- Local timestamp / acting role / milestone: 2026-10-27T19:22:38.253284-04:00 / orchestrator / prompt-release-2026-10-27.
- Requested scope: Push and deploy the Markdown prompt migration and both prompt corrections.
- Starting repository state: Original dirty dev/tool-api-services02427 preserved; isolated release begins at the same required API prerequisite.
- Work performed / changed files: Created managedworktree/branchcodex/markdown-prompts-release from02427. Copied exacttestedruntime/Markdown, scopedpackaging/browser/docs/evidence and prerequisitefixes. Committed API/cachefixes, migration andtwo promptcorrections separately. Originaldirtyapplication checkout preserved.
- Decisions: Ship only tested prompt/API prerequisites; retain unrelated Calendar location work locally. Use full CI/browser/PR/main release artifacts and existing production configuration without additional model or business test writes.
- Checks and evidence: All namedMDpayloads preserved when removingoutside-blockEOFformattingblanklines in13assets. No environment/privateevidence copied. Calendar-sync remains02427base; separatecalendar-location/projectionfiles excluded. Recorded known-good serviceIDs before anydeploy.
- Resulting state / acceptance: Release preparation in progress; no push or deployment claimed.
- Remaining work and handoff: Complete full checks, independent review, push/PR/main integration and exact-commit artifact rollout/health verification.
