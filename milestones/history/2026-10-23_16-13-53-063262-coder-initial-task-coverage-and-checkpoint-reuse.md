# Expose saved task coverage and avoid duplicate unfinished checkpoints

- Local timestamp / role / milestone: 2026-10-23T16:13:53.063261-04:00 / coder / isolated tools.
- Scope and actual evidence: Root corrected handler/pipeline/prompt in isolatedworktree: pure initialTaskCoverage maps only exact-current claimedoriginals toqueueRef+count inmodelcontext; no unrelatedtaskcontents/IDs or providercalls. Prompt can explicitly accountfortask-coveredqueuedinput. afterInitial refreshes own taskstore and skipsgenericcheckpoint when currenteligible taskalready retains exactlysameoriginal; omittedinput remainsqueued, noautocompletion/deletion. Independent source reviewPASS; dedicated exact/changed/expired and modelretestpending. Thirdcoderowns only3legacytestfiles to restore explicitread/sync/fragmentfixturecontracts; noappchanges/deployment.
- Remaining work: finish bounded regressions, model retry under fresh cap, independent acceptance, integration and authorized deployment.
