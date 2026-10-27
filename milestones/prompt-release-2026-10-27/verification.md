# Prompt release verification

Source release: e6c62403fa0bc6addb8af31449f73d52bf0e5e97, merged through [PR1](https://github.com/yuyanghu06/flockatnyu/pull/1).

- Normal local pre-push CI:3040passed,0failed,2optional skips; all5browser workflows pass.
- Independent release source review accepted the tested runtime and all87Markdown assets.
- GitHub PR run40602208711 passed quality/browser. Main-only [release run40603076874](https://github.com/yuyanghu06/flockatnyu/actions/runs/40603076874) passed quality/browser/packages at the exact source commit.
- Downloaded archive contents reject unsafe/private paths and match every packaged application source and Markdown file to the commit. Web74prompt assets, worker35, Discord3; assets overlap. Gmail packages contain none.
- Pre-upload review rejected the worker image: it copied an absent tools root and omitted the required src/api root. No rejected artifact was uploaded.
- Correction ee936d2 contains the reviewed Dockerfile and real COPY-filesystem regression. Independent3-case suite and both missing-source/API failure controls pass, with network denied. This does not claim an actual Docker-engine build.
- A separate authorized full-tree release8718a1c909fc0122cda69b4f4391f2cca169a819 includes the same87assets and353prompt blocks byte-for-byte. Raw EOF framing outside blocks differs in13files. That release also includes its separately requested Calendar correction and the worker image fix.

No deployment or hosted smoke result is established in this record yet. Keep the worker disabled and do not start another production cycle. Resolve overlapping rollout ownership before uploads. Existing private model-test evidence remains valid for unchanged prompt payloads; no new inference was needed.
