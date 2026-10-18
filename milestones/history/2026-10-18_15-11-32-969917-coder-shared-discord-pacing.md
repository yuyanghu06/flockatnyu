# Discord scans slowed with shared retry cooldowns

- Local timestamp / acting role / milestone: 2026-10-18T15:11:32.969917-04:00 / coder / agent-prompts.
- Requested scope: complete correct prompt behavior and slow Discord checks per user preference.
- Starting repository state: last full920checks passed; final actual-model14diagnostics exposed bounded workflow/instrumentation issues; user reported real rate-limited summary.
- Work performed / changed files: scoped Discordclients/config/pacer/aggregate tests or parent config/app/docs/journal as described.
- Decisions: Both botclients use shared per-process per-bot/fetchtransport serialized pacing, default750ms. Retry-After seconds/date, JSON retry_after and exhausted bucket resetAfter waits share cooldown, includinglongdelays. Channel scans sequential; request90s/scan120s bounds and existing source/content/modelcostcaps preserved. No cross-process coordination. Botclientrate_limited requires upstream429; summary-model partialreason may also use rate_limited, so screenshot alone cannot prove provider or culprit.
- Checks and evidence: 233/233broaderchecks passed, whitespace passed. OfficialDiscordrate-limitdocs read; no bot/model/metadata calls.
- Resulting state / acceptance: runtime sources frozen; finalactual-modelacceptance pending. No deployment, workeractivation or real Calendar/map writes.
- Remaining work and handoff: complete final modelrun/regressions/builds; record exact remaining operational limits.
