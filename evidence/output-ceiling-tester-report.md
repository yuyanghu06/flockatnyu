# M20 output ceiling — independent tester PASS

- **Milestone / role / scope:** small bounded acceptance of the default output ceiling change from 1600 to 3200 tokens. Owned only provider tests and `evidence/output-ceiling-*`; no implementation, shared documentation/journal, cloud, credentials, actual models or child agents.
- **Starting state / inspected files:** summary-config/provider, existing provider tests, current milestone/to-do state, parent acceptance criteria and agent report template. Provider/runner code hashes match the accepted citation-enum pass; only the root-owned configuration changed.
- **Changed files:** `tests/discord-summary-provider.test.mjs` updates the request expectation and over-limit usage fixture, and adds three boundary/accounting checks. Evidence contains commands, results and implementation hashes.
- **Decisions / assumptions:** token ceiling and output-byte ceiling are separate. Known usage must fit the prior reservation; malformed over-ceiling usage retains its full unknown-dispatch allocation. API responses are mocked and local SQL uses synthetic fixtures.

## Executed checks

| Command | Result |
| --- | --- |
| `node --test tests/discord-summary-provider.test.mjs` | Exit 0, **28/28**, 122.8ms; `output-ceiling-provider-tests.log`. |
| Targeted runner/cache command below | Exit 0, **12/12**, 2.88s; `output-ceiling-runner-cache-tests.log`. |
| `npm run build:api` | Exit 0; API syntax/runtime dependencies verified in `output-ceiling-api-build.log`. |
| `git diff --check` | Exit 0. |
| SHA256 checks for config/provider/runner | `output-ceiling-hashes.log`; config `cbe1b3c0c49c76934318a7dc9b2ef0764bc60ab7b0ee2621b2fdba16ac265d6a`. Provider and runner hashes remain unchanged. |

Exact targeted command:

```sh
node --test --test-name-pattern='cached|cap|budget|max requests|uncertain|planning-only|caller abort' tests/discord-summaries.test.mjs
```

## Verified behavior

- Actual default and emitted Responses request use 3200 output tokens. Before fetch, the dispatch hook has already reserved all 3200 tokens plus the complete serialized input/schema budget. The output-cost allowance increases by exactly $0.0008 at the existing price; no operation/run cap increases.
- Complete responses reporting 2400 or 3200 output tokens are accepted with observed usage/cost committed. Reporting 3201 is unpublishable, clears trusted usage and commits unknown dispatch status with the full worst-case reservation retained; it does not receive an extra request or free retry.
- The independent 32768-byte output limit remains enforced. Structurally valid exactly 32768-byte JSON is accepted; 32769-byte JSON is rejected as `output_too_large`, while valid observed token usage remains accounted.
- Existing model, promptv3, reasoning-none, default service tier, tools/images/storage exclusions, strict citation enum, 512 unique-ID cap, 49152-byte input, two retries, 30000ms request deadline, concurrency 4, $1 run/$5 operation and 10000-operation-request limits remain passing.
- Refusal/incomplete/malformed/foreign output, oversized response, unavailable/over-bound usage, reservation rejection, unknown charges and abort tests still pass.
- Targeted runner checks retain cached maps/reducers, full provenance and budget-safe resumption. Included the existing genuine009 780-original/37-stage mock-Responses SQL fixture: cached publication uses 0 new dispatches and retains prior receipts/cost. No SQL scale was repeated.

## Findings / limits / handoff

No implementation finding. An initial strict floating-point delta assertion was corrected to a tiny arithmetic tolerance; the reservation formula and monetary increase remain directly verified.

**Verdict: PASS for this local configuration change.** No real model response, historical bootstrap completion, production pruning or cloud/deployment state was independently exercised. Larger output capacity cannot by itself establish factual quality or guarantee every reducer completes.

Folder guides and milestone/history entries are orchestrator-owned. Root should journal this bounded pass and combine it with evaluator acceptance before continuing the existing operation under its original caps.
