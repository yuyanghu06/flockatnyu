# M20 retention commands and lineage prompt integrated

- Local timestamp / acting role / milestone: 2026-10-11T18:34:25.788125-04:00 / orchestrator / M20.
- Requested scope: Corrected weekly/monthly replacement storage and recurring cadence.
- Starting repository state: Corrected storage rewrite active; runner/scheduler implemented with independent fixtures; no live006/model/pruning.
- Work performed / changed files: package.json summary aliases nowpreview/bootstrap/weekly/monthly andworker:summaries scheduled, supersedingoldrun/backfill generation. .env.example records no daily/verified rawreplacement and Monday/1st08NY. Providerprompt explicitly requires inherited originalcitations forverifiedprior summaries, forbids syntheticinput citations andclaimingdeletedoriginals reread. Updated retention direction notices/guides in docs,server/discord,supabase,deployment andevidence.
- Decisions: OfficialRailwayblog confirms dayofmonth/weekdayOR; plannedone-servicecron0 12,13 1 * 1 wakesMonday/1stUTC12+13, scheduler08NY gatehandlesDST without daily wakes. No actualschedule/model/schema change in this pass.
- Checks and evidence: node --test tests/discord-summary-provider.test.mjs20/20passed. APIbody/schema/costguards unchanged; newpromptVersion discord-retention-v2 assignedbyrunner. Official https://blog.railway.com/p/run-scheduled-and-recurring-tasks-with-cron inspected. Fullstorage/schedule acceptance pending.
- Resulting state / acceptance: Rootintegrationreadyforindependentretentiontests; no livecompaction claimed.
- Remaining work and handoff: CompleteSQLlifecycle/scaletests/evaluator; actualhosted006/preview andweekly/monthlypilot; verifythenprune allolderhistory anddeployexactsummarycron. Preserveotherwork andsourcepermissions/imagesoff/vectorsoff.
