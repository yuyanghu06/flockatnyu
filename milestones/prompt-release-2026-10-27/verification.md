# Prompt migration and fixes: release evidence

The requested Markdown migration and both prompt fixes are pushed and deployed.
[PR1](https://github.com/yuyanghu06/flockatnyu/pull/1) merged as e6c62403fa0bc6addb8af31449f73d52bf0e5e97. The required worker image correction [PR2](https://github.com/yuyanghu06/flockatnyu/pull/2) passed quality/browser checks and merged as bb02eb826aed39ef17838a90ab7bd6f22f6223d6.

## Checks before release

- Normal local pre-push CI passed:3,040 tests,0 failures,2 existing optional skips. All5browser workflows passed.
- Independent source review matched the configured-model tested runtime and prompts. The earlier40-request gpt-6-luna retest passes both original failures; this deployment pass made0 new model requests. See [prompt behavior evidence](../prompt-clarification-completion-2026-10-27/verification.md) for strict/semantic outcomes and limitations.
- PR #1 quality/browser run 40602208711 passed. Main-only [release run 40603076874](https://github.com/yuyanghu06/flockatnyu/actions/runs/40603076874) produced verified exact-commit source-only packages.
- Before upload, review rejected the worker image because it copied an absent tools directory and omitted required src/api files. The rejected artifact was never uploaded. The corrected actual COPY filesystem passes real web/worker imports with networking denied. Removing src/api or restoring the absent tools copy reproduces the failures. Independent3-case packaging checks and standard hooked CI pass; [PR #2 run 40604671626](https://github.com/yuyanghu06/flockatnyu/actions/runs/40604671626) passes both gates. Filesystem projection is not described as a Docker-engine build.

## Actual production rollout

The other active chat had a separately authorized full-tree rollout, including the Calendar location repair and all five services. This chat made no overlapping upload or configuration mutation. That rollout used pushed commit 8718a1c909fc0122cda69b4f4391f2cca169a819, which contains the corrected worker image and the exact same 87 prompt assets/353 named payloads as the accepted prompt release. Thirteen raw Markdown EOF framing differences lie outside prompt blocks. Every uploaded web/worker/Discord application source and prompt file was checked against that production commit; upload receipts bind package hashes to deployment IDs.

| Service | Successful deployment | Readiness |
| --- | --- | --- |
| web | f6958635-8858-49d6-ad7d-c324feb27dbb | Health, normal login, API access and exact assets verified |
| update-agent | 7e493f9d-52f4-4990-bd35-ec9a4452a2e2 | Installed code; startup reports disabled |
| discord-events | b7a20484-b720-4c23-b9d3-64459ed41532 | Chat ready, gateway resumed, listening |

Gmail services were also deployed by the separately authorized full-tree rollout; they were not uploaded by this prompt-only release.

## Independent hosted verification

The uploaded web archive SHA256 is b3a81a9f3fd3d577b89e699ebe4de8f4c33aa8db3dea0fec66dee65d05dd445b. The independent smoke check verified its manifest commit and extraction before making 14 normal HTTPS requests, including one login redirect:

- Public health 200 with ok:true; anonymous API 403.
- Normal Origin-checked password login succeeds; authenticated API 200 with access.allowed:true.
- Hosted index and all 8 JavaScript/CSS hashes exactly match the uploaded archive.
- Server prompt Markdown returns 404; redirects stay on the same HTTPS origin.
- The custom domain https://flock.techatnyu.org separately returns healthy 200.

Credentials and cookies stayed in memory. No model call, source-content query, business mutation, schema migration or manually forced worker cycle was made by this deployment verification. Private configuration readback confirms AGENT_AUTOMATION_ENABLED=false and staged mode true. The deployed update agent remains inactive; no active planner cycle or live model behavior is claimed. No Railway SSH key was registered or used.

Independent evaluator ACCEPTS the prompt deployment and qualified readiness. [Safe receipts](receipts.json) preserve hashes, exact commit/deployment IDs and the source-free hosted check. The separate full-tree release journal owns its broader changes and service configuration history. Future active-worker verification requires a separately authorized cycle; no such cycle is pending in this release.
