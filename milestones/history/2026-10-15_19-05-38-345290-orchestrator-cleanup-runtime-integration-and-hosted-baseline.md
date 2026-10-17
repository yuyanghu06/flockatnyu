# cleanup runtime integration and hosted baseline

- Local timestamp / acting role / milestone: 2026-10-15_19-05-38-345290 / orchestrator / M28.
- Requested scope: User-approved14table/15column cleanup and explanation of remainingtables.
- Starting repository state: New013/014locallyaccepted, hosted schema unchanged at baseline; preserve concurrentdirtyworkspace.
- Work performed / changed files: Root removed5obsolete npmcommands, addedcleanup testcommand, preserved oldstorecontract exclusively in tests/fixtures for historical001–010tests, updated docs and tableguide. Hostedbeforeinventory35tables/27Mirocols:all14candidatesempty/noactivelegacylease,722legacy+87live=809summaryvectorsready/0missing,351pendingjobs. testMiro25/25,assistant22/22 pass; broadDiscord338/339 hasoneobsolete memory-storeexpectation queuedfortesterfix. Initialreadonlymanagement attempt tocallservice-onlystatuswasdenied; statusreadusingexistingserviceadapter passed. No permissionchanges.013applyinprogress; noappliedclaimyet.
- Decisions: Keepallretaineddata/sourcepermissions/receipts; noCASCADE/oldmigrationrewrite; historicaltesthelpers excludedfromdeploy.
- Checks and evidence: Actual commands/results cited above; evidence/m28-schema-cleanup/ contains tester log/report and sanitized hostedbefore.json.
- Resulting state / acceptance: Localimplementationaccepted; hostedapplication/deployment/readbackpending; onehistoricaltestexpectationrequiresadaptation.
- Remaining work and handoff: Complete013then014application, preservationreadback, workerrollout and finaldocumentation. NoMirocredential/scopeprovided, syncstaysdisabled.
