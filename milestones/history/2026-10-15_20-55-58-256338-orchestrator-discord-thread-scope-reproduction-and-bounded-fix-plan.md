# discord thread scope reproduction and bounded fix plan

- Local timestamp / acting role / milestone: 2026-10-15_20-55-58-256338 / orchestrator / M30.
- Requested scope: Diagnose reported Bolaji Discord channel-scope denial; user also requests Lipton be non-selectable.
- Starting repository state: M29completedlive-only3-tablebackend; sourceandpermissionsremainrestricted; existingdirtyworkspacepreserved.
- Work performed / changed files: ActualconfiguredbotsearchqueryBolaji:HTTP200/allcheckedmetadata200,25hits(23directselected+2registered/allowlistedpublicthreadhits),bothparentsselected,appdiscardedall. NoDiscord403. Assignedboundedthreadvalidationfix preservingownsourceUUID/currentpermission/ancestry/finalrevalidation; unknownforeignhitsremain denied. No models/contentwrites/cloudschemachanges. Liptonbrowserpassindependentinprogress.
- Decisions: No broaderDiscordpermission/sourcegrantchanges. PreserveLiptonvisiblecontextgeometryandotherselectablelandmarks. UseexistingrequestRAMdataonly.
- Checks and evidence: Concretechecksabove; evidence/m30-discord-search/before-reproduction.json containscounts/statusonly. Independentbrowser/currentthreadregressionspending.
- Resulting state / acceptance: ExactDiscordcauseestablished, fixunderway; localLiptonregistrationfiximplemented, independentbrowseracceptancepending.
- Remaining work and handoff: Retestthreadpermission/scopedenialbranches, confirmrealbotsearchafterfix, refreshlocalAPIafterbrowserQA; verifyLiptonactualraycast/clickinbrowserandrecordfinaloutcomes.
