# M18 hosted group publication and API timeout diagnosis

- Local timestamp / acting role / milestone: 2026-10-11T17:43:54.545730-04:00 / orchestrator / M18.
- Requested scope: Applyacceptedperformancefix, classifyexistingfullhistory andpreparehostedworker.
- Starting repository state:108828originals/216watermarks independentlyaccepted;0groups;cronoff;004locallyaccepted134checks.
- Work performed / changed files: Applied004as hosted20261011213945discord_memory_rebuild_performance. RuntimeAPIreturned57014after9186ms; directauthorizedMCP EXPLAINANALYZE then successfullypublishedgroups. RepeateddirectMCPpublicationwithtransactionlocal16MBwork_memalso succeeded. No role/globalconfigurationchanges or raworiginalwrites.
- Decisions: Preserveatomicguardedpublication; addnew005function-specific60sstatementbudget/16MBwork_memandmatching65sworkerRPCbudget. OfficialSupabase andPostgREST hoistedfunctionsettings documentation supportsfunction-only setting; keepallotherRPC12s.004nowimmutable.
- Checks and evidence: Firstdirectpublication35408ms/temp3035reads4849writes; repeated16MBpublication36658ms/0tempblocks. Independenttester confirms108828uniquecomplete memberships/779groups and0source/policy/period/countmismatches. Exacttiercounts daily84groups1867messages,weekly22/1620,monthly673/105341; all108828 independently datechecked. Runtime API stillnotaccepted; directpublicationisnotworkerproof.
- Resulting state / acceptance: Actualhostedgroupstorage publishedandindependentlyaccepted. API8seconddefault stillblocksrecurringworker until005review/apply/runtimeproof.
- Remaining work and handoff: Review/test005+clientbudget, applyonce, runrealAPIclassification, regenerate19-filecontextforchangedstore, deployandverifynewRailwayrun, restorecron.
