# Read-only backend audit

- Local timestamp / acting role / milestone: 2026-10-13_22-10-34-879169 / evaluator / current functionality audit.
- Requested scope: check what functionality is built now.
- Starting repository state: published M22; existing M20 backend and M21 frontend acceptance retained.
- Work performed / changed files: Inspected Hono routes, providers, knowledge/Discord stores, worker/summary implementations, migrations and recorded hosted artifacts. Discord discovery/collection and weekly/monthly retention are implemented with recorded October 12 cloud runs. Recorded snapshot: 216 sources, 722 summaries, four current-week raw and 108,957 represented originals. Default production auth denies protected requests; chat uses raw discord_search and never wires summary-store.listSummaries. Drive/Calendar adapters and embeddings remain absent/inactive. Summary cron is configured but actual scheduled invocation remains unverified.
- Decisions: distinguish source implementation, historically verified hosted runs and checks rerun today; preserve all application/user changes.
- Checks and evidence: Static source/evidence reads only; no current cloud health, credential inspection, model requests or database changes. Historical hosted evidence is distinct from current verification.
- Resulting state / acceptance: Accepted inventory. Prioritize member auth/access policy and tier-aware cited summary retrieval; several older guides contain superseded launch claims.
- Remaining work and handoff: unresolved product tasks preserved in to-do; root serializes all journal writes.
