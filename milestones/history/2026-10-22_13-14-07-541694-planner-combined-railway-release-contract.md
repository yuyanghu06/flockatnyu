# Combined Railway release contract

- Local timestamp / role / milestone: 2026-10-22T13:14:07.541694-04:00 / planner + orchestrator integration / combined-release.
- Requested scope: review entiretree, deploy all affected services, thenlogicalcommits/push.
- Starting state: extensive accepted localwork sincec984237 and unchangedproductiondeployments.
- Work performed / decisions / evidence: User explicitly requested all working-tree changes deployed to Railway, then published in logical GitHub commits. Planner inventories web/update-agent/Discord/Gmail changes and confirms036 prerequisite, existing037 receipt, newAttio privateweb settings, combined web-beforecollector sequencing and separate postweb avatar cutover. Found collector static packager rejects3new sharedchatmodules and Dockerfiles omitrootsharedsources. Parent exactallowlist/COPYsanitizedserver fixes implemented; tester independently correcting closure/regression tests. CLI routine authentication renewed, connectedRailway and scopedSupabaseMCP reads work. Frontend/API builds pass. Initial2150test run2147pass2knownfail1optionalskip; finalrerun pending. No live service upload yet.
- Checks: static import closure81web/52worker/25Discord/11Gmail; frontend/APIbuild; independentfulltestsinitialevidence; freshRailwayinventory andSupabasemigrationlist.
- Remaining work: requiredschema/config, independentpackage/browsers/finaltests/review, rollouts, hostedchecks, Gitpublication. Secrets/sourcecontents excludedfromjournal.
