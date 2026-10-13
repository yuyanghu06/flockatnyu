# M20 6400-token ceiling — independent tester PASS

- **Milestone / role / scope:** bounded local acceptance of root's 3200→6400 configuration change. Only `tests/discord-summary-provider.test.mjs` and `evidence/output-6400-*` were changed. No implementation, journal, docs, credentials, actual model/Discord/cloud calls or child agents.
- **Starting state / inspected files:** summary-config/provider and existing tests, current task criteria, milestone/to-do snapshot and report template. Provider/runner hashes remain unchanged from the accepted phase-parser pass.
- **Work performed:** updated default/request/reservation expectations to 6400, overflow cases to 6401, and the previous 3200 ceiling comparison. Existing 2400/3200 valid-usage checks and selected/global-byte/phase/usage tests were preserved.
- **Decisions / assumptions:** the larger token ceiling changes reservation headroom; it does not authorize larger financial caps or weaker validation. Unknown/over-bound responses retain full reservation cost. All API output was mocked.

## Executed checks

- `node --test tests/discord-summary-provider.test.mjs`: exit 0, **57/57**, 124.9ms; `output-6400-provider-tests.log`.
- Pure runner/cache command below: exit 0, **11/11**, 171.5ms; `output-6400-runner-cache-tests.log`.
- `npm run build:api`: exit 0; API syntax/runtime dependencies verified; `output-6400-api-build.log`.
- `git diff --check`: exit 0.
- Config SHA256: `4829e01ccb629514d39d618a7dd2a5e37b8260634e4a85254594418a4990432e`; provider/runner hashes are unchanged, recorded in `output-6400-hashes.log`.

```sh
node --test --test-name-pattern='cached|cap|budget|max requests|uncertain|planning-only|caller abort' --test-skip-pattern='genuine009' tests/discord-summaries.test.mjs
```

## Verified behavior

- Actual default and emitted request use 6400 output tokens. Before fetch, the hook has reserved all 6400 tokens plus the full serialized input/schema. Compared with 3200, output reservation headroom increases by exactly $0.0016 at the unchanged price; output allowance is $0.0032 before input cost.
- Completed 2400,3200 and6400 usage is accepted/accounted. 6401 output usage is unpublishable, clears trusted usage and conservatively charges the full unknown-dispatch reservation; no free retry or summary escapes.
- $1 invocation/$5 operation/10000-operation-request caps, 49152-byte input, 32768-byte selected output, 262144-byte total response, model, promptv3, schema/512-citation limit, retries/deadline/concurrency remain unchanged. Exact byte boundaries and whole-response commentary usage pass.
- Refusal, incomplete/foreign/malformed output, reservation rejection, unavailable/excess usage and abort behavior still pass. Cached map/reduce stages, uncertain charges and budget-safe resumptions remain valid; no cache input implementation changed.

## Findings / limits / handoff

No source finding. The first inherited cache-name filter also selected the existing isolated PGlite fixture; its 12/12 log is preserved as `output-6400-cache-initial.log`. It used synthetic data and no external SQL. The final targeted command explicitly excludes that fixture and verifies 11 JavaScript-only cases. No SQL scale or broad integration was repeated.

**Verdict: PASS for the local 6400 configuration change.** This does not prove real reducer completion, factual quality, historical bootstrap completion or production pruning. No live model calls or cloud changes were made by this tester.

Root owns folder-guide/journal updates and can record this pass with evaluator acceptance before continuing the same operation under its original caps.
