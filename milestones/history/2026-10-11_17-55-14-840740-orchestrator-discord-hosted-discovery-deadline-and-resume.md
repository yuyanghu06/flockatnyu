# M18 hosted discovery deadline and resumed worker

- Local timestamp / acting role / milestone: 2026-10-11T17:55:14.840740-04:00 / orchestrator / M18.
- Requested scope: Actualhostedworker verification andscheduledcontinuation.
- Starting repository state:136localchecks/APIgroupingaccepted; newDockerbuildsuccess; cronoff.
- Work performed / changed files: Deployment52696393-5d07-4649-8bde-7c995b6ba151 strictjobaborted exactly240seconds during discovery; userobservedRailwayCRASHED. Root/evaluator independentlyreadterminalexit1/aborted anddurablearchives-phasecheckpoint. Increasednon-secretservice discoverybudgetto900000ms withinexistingcap,skipdeploys,settrue; redeployed SAMEacceptedimage as e5ec96e5-d670-43e0-b32b-cdf138c81ad8. No code/credentials/rawrecordchanges.
- Decisions: Resumeexistingcheckpoint ratherthanreset; keepsyncbudget900000/classification65s andcronoff untilactualnewjobready. A buildSUCCESS doesnotestablish workercompletion.
- Checks and evidence: Start21:49:29.374Z/abort21:53:29.845Z; stagearchives updated21:53:29.417Z. FilteredCLI CRASHED/stopped; budgetmutationsettrue andnewdeploymentID observed. Existing108828originals/779groups remain stored.
- Resulting state / acceptance: FirsthostedM18runtimeattemptfailedits discoverybudget; boundedresumemitigationapplied, actualrerunpending. No scheduledsuccessclaim.
- Remaining work and handoff: Independentrerun/budget/checkpoint/jobresultverification; restorecron onlyafterready. M20summaryimplementationnewfiles proceeds separately, noLLMkey in this archiveimage yet.
