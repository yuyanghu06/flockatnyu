# M38 complete: final housekeeping; architecture alignment next

Goal: finish the bounded cleanup so map/UI and agent work can proceed independently.

M36 collector/archive cleanup is accepted: Discord and Gmail run as separate slim continuous Railway services sharing Supabase; Miro remains separate and paused. Final Discord revision c8035dd4-e073-477a-9fcd-dadc5334b4ef and Gmail1f4d4571-ebdc-4295-b016-91f4eec956c1 independently verified SUCCESS/RUNNING. Controlled Discord restart resumed successfully. Migration020 applied with receipt20261017184647; five-table schema, ACLs, source identities and unrelated data preserved. No chat/LLM worker is deployed.

## Completed scope

Moved four callable tool modules to tools/{discord,google,miro} and13 developer/deployment/asset scripts to scripts/. Connector clients remain in server/. Imports, npm commands, syntax checks and current guides updated. No prompt/memory migration or new Calendar/map tools. See [parallel ownership handoff](../docs/cleanup-handoff.md).

## Verification and limits

M37 final581/581 tests pass (zero skipped), API and web builds pass, git diff --check clean. All four tool modules differ only in import paths. Prepared Discord12/Gmail11/Miro6 runtime modules are byte-identical to pre-move baselines; no collector redeployment needed. Evidence: evidence/m37-tool-organization. M37 implementation/check/review performed sequentially here without new independent specialists.

M36 final full suite581/581; independent final focused58/58 and rollout ACCEPT. Four Discord creates and one actual Gmail email observed. Native edit/delete and live blacklist non-ingestion remain pending; local fixtures pass. Invalid/expired Discord sessions can leave gaps without backfill. Admin browser fixture updated but not executed. Existing frontend chunk-size warning remains.

## Next action

Cleanup is complete. Start separate map/UI and agent/tool workstreams using the ownership handoff; coordinate shared manifests/API contracts and serialize journal writes. M27 authorization/token/initial Miro capture remains open; M34 prompt/write-adapter and deployed agent execution remain future work. Gmail switch separation is deployed in M38: collection enabled, model execution disabled on Gmail.

## Latest pass

[2026-10-17_14-59-55-608233-orchestrator-collector-acceptance-and-tools-plan](history/2026-10-17_14-59-55-608233-orchestrator-collector-acceptance-and-tools-plan.md)

[Final tools cleanup verification](history/2026-10-17_15-02-04-579213-orchestrator-tools-cleanup-verified-and-handoff.md)

## M38 completed pass

Independent Gmail switch and enqueue gate implemented; redundant metadata worker and wrapper-only test removed. output/ deleted at the user’s request;26 documentation avatars retained. Current docs corrected. 581/581 tests and55/55 focused checks pass; API/web builds pass. Gmail revision8f10ca33-b53b-4358-96d9-b2becdf6f5e5 deployed with independent collection=true/model=false; healthy200, unsigned/forged401 verified. Scoped source/build/test commit238a346 completed, no push. Unrelated map/UI/artwork remains outside this commit. Next align overall architecture with the user.

[Implementation pass](history/2026-10-17_15-04-51-162664-orchestrator-final-housekeeping-implementation.md)

[Housekeeping verification and source commit](history/2026-10-17_15-07-19-846937-orchestrator-housekeeping-verified-and-committed.md)
