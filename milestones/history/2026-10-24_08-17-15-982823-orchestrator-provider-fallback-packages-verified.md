# Reviewed provider fallback packages ready for release

- Acting role / milestone: orchestrator / provider fallback.
- Requested scope: user requested ordered private provider links and APIkeys with second/third fallback. Existing live deployment authorization retained.
- Starting state: codex/dev f8a4105, unrelated dirty documentation/setup preserved; web9843c735 and workera34ade2f live.
- Work performed / files: integrated accepted runtime/test changes, .env.example, docs/provider-routing.md and auditguide; staged only this pass's additions to already-dirty docs/info.md/tests/info.md. Serialized coder/tester/evaluator reports; refreshed snapshot/to-do/scope. Private ignored.env now contains one currentprimary inLLM_PROVIDERS_JSON; existinglegacykey/settings preserved and reloadvalidated, no secretsprinted. No newprovider credential is invented.
- Decisions:1–8entries, URL/key required, optional protocol/modelinherit. Sharedrouter coverschat/plannerallthreeoperations, one existing timeout and actual perattemptauditidentity. Immediate401/402/403/404/approvedquota routing, boundedexistingtransientretry, no post2xx/stream/parser/localvalidation/auditstart/abort replay. Persistentpause, message recovery and taskhistory remain separate.
- Checks/evidence: reviewedruntimehashes match. Actual deployedwebbaseline273source/assetpins verify; workerbaseline froma34 reviewedfreeze. Eachrelease differsfromitsownbaseline only server/config.js,providers/index.js,retry.js,model-audit.js. Bothfrozenroots pass109/109 andAPIcompiler/dependencies. Temporarypackages contain279webfiles/60workerfiles, allfouracceptedruntimehashes match; privatekeycontentscanpasses. No frontend rebuild/change, source/Calendar/map/collector/schema calls or new inference.
- Resulting state / acceptance: evaluatorACCEPT; runtime/testsfrozen. One configuredprimary remainsoutofcredits; no livebackupavailability verified. Sourcepublication and authorized isolateddeployment next; actual release not yetclaimed.
- Remaining work / handoff: publish exactsource, privatelyseedoneprimarylistoneachmodelservicewithoutdeployingunreviewedcode, uploadreviewedpackages, verifySUCCESS/read-onlyhealth and settings. UserwilladdbackupURL/key/model entries later. No billingrestore or businesswrite smoke test authorized by this feature.

Recorded 2026-10-24_08-17-15-982823 America/New_York.
