# M20 bounded truncation recovery — independent tester PASS

- **Milestone / role / scope:** provider-only adaptive truncation acceptance. Owned only `tests/discord-summary-provider.test.mjs` and `evidence/truncation-recovery-*`. No implementation/config/SQL/journal changes, external SQL, models, credentials, cloud or child agents.
- **Starting state / inspected files:** current parent criteria, provider/config and existing tests, milestone/to-do snapshot and report template. Stable coder contract requires an explicit global incomplete/max-output reason, valid bounded usage and successful first-receipt commitment before one larger-output retry.
- **Work performed:** added six scenario groups with 17 negative subcases. Existing 6400 default/overflow, phase, byte, citation, cost/retry and cancellation assertions remain active. All HTTP/model responses are mocked.
- **Decisions / assumptions:** recovery is per invocation, not a global configuration change. Partial JSON can be malformed because it was truncated; retry eligibility comes from the explicit response reason and bounded structural/usage guards, never inferred from text or reaching the numeric limit alone.

## Executed checks

- `node --test tests/discord-summary-provider.test.mjs`: exit 0, **80/80**, 128.9ms; `truncation-recovery-provider-tests.log`.
- Pure targeted runner/cache command below: exit 0, **11/11**, 165.1ms; `truncation-recovery-runner-cache-tests.log`.
- `npm run build:api`: exit 0, API syntax/runtime dependencies verified; `truncation-recovery-api-build.log`.
- `git diff --check`: exit 0.
- Provider SHA256: `0c97b47657cded5cc875e336d48dd2e6268c78227356e76ae0a82cde128cfc71`. Config/runner hashes remain unchanged, recorded in `truncation-recovery-hashes.log`.

```sh
node --test --test-name-pattern='cached|cap|budget|max requests|uncertain|planning-only|caller abort' --test-skip-pattern='genuine009' tests/discord-summaries.test.mjs
```

## Independently verified behavior

- Every invocation starts with 6400 tokens. Recognized truncation commits its observed 6400-token usage before reserving a separate 12800-token attempt; the second fetch sees the first settled receipt and a fresh reservation. Both full-body/schema estimates are checked before dispatch, including the extra serialized digit. Model, instructions, schema, input and context match exactly across attempts except `max_output_tokens`.
- Completed 12800 usage is accepted only within the adaptive reservation. 12801 clears trusted usage, becomes unpublishable and retains the full 12800 worst-case unknown allocation. Existing 6401 initial-ceiling rejection remains unchanged.
- Network→truncation→success and truncation→network→success share the existing three-attempt maximum. Repeated truncation permits only the original and one larger attempt. Truncation on the final available attempt does not create a fourth request. Adaptive state does not leak into another invocation; `maxRetries:0` still dispatches once.
- Missing/empty/other reasons, content filtering, absent/bad/over-bound usage, completed malformed/foreign/ambiguous output and a selected incomplete message under globally completed status do not adapt. Explicit refusal/ambiguous/commentary-only/unsupported fragments or selected-text overflow also block globally incomplete adaptation. Total raw response overflow remains conservative unknown usage.
- Explicit truncation with no emitted output may recover through the same bounded known-usage gate. No successful summary is inferred from the incomplete text itself.
- A rejected retry reservation preserves the first receipt and performs no second fetch. A lost first usage commitment prevents escalation. Pre-abort dispatches nothing; abort during receipt commitment or adaptive backoff preserves the observed first charge and makes no additional reservation/fetch.
- $1 run/$5 operation/request caps, 6400 default config, 512-citation enum, 32768 selected-byte/262144 response-byte limits, phase selection, model/promptv3 and cached input identity remain unchanged. Pure cache/provenance/uncertain-charge/budget checks pass; no SQL or archive scale was repeated.

## Finding / limitations / handoff

Initial 79/80 run found a status-only cancellation edge: abort during successful first-receipt commitment preserved the charge and prevented another request, but returned `provider_incomplete`. The coder now returns `aborted` with observed usage after commitment; final 80/80 closes the regression. Before-fix evidence remains in `truncation-recovery-abort-before.log`. No financial/source safety failure was observed.

**Verdict: PASS for local bounded truncation recovery.** Mocked usage does not prove actual model completion, factual quality, historical bootstrap completion or production pruning. No paid diagnostic/model/cloud calls were made.

Root owns guide/journal updates and should record this pass with evaluator acceptance before deploying and continuing the same operation under its original caps. Larger output can still fail safely; this pass authorizes no further escalation or retry allowance.
