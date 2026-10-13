# M20 Response message phases — independent tester PASS

- **Milestone / role / scope:** bounded provider parser acceptance. Owned only `tests/discord-summary-provider.test.mjs` and `evidence/response-phase-*`. No implementation, shared docs/journal, keys, cloud, actual models or child agents.
- **Starting state / inspected files:** parent criteria, current milestone/to-do state, agent report template, provider implementation/config and existing tests. Provider coder's stable public contract was coordinated directly.
- **Work performed:** six new scenario groups with 23 negative subcases exercise actual `summarize()` behavior through mocked Responses HTTP data. Existing request schema, 3200-token reservation, citation bounds, budget/abort and malformed-usage cases remain passing.
- **Decisions / source contract:** used the OpenAI Docs skill and fetched official documentation. Final-answer or absent/null-phase messages are eligible for structured parsing; commentary and other explicit phases are excluded, including schema-looking commentary. A refusal cannot promote commentary to a fallback. These rules match the [OpenAI SDK parsing helper](https://github.com/openai/openai-python/blob/main/helpers.md#parsing-responses-api-output) and [official phase documentation](https://developers.openai.com/api/docs/guides/reasoning). The application's additional exactly-one eligible assistant-message rule intentionally rejects ambiguity; the SDK's first-parsed-result convenience is not used.

## Executed checks

| Command | Result |
| --- | --- |
| `node --test tests/discord-summary-provider.test.mjs` | Exit 0, **57/57**, 132.0ms. `response-phase-provider-tests.log`. |
| Targeted runner/cache command below | Exit 0, **12/12**, 2.89s. `response-phase-runner-cache-tests.log`. |
| `npm run build:api` | Exit 0; API syntax/runtime dependencies verified. `response-phase-api-build.log`. |
| `git diff --check` | Exit 0. |
| SHA256 checks | `response-phase-hashes.log`; provider `675b93fd42e0d90a556ded6512d18964719b49a2739b59ecdabafd0e876dd027`. Runner/config and applied006–009 hashes match prior acceptance. |

Exact targeted command:

```sh
node --test --test-name-pattern='cached|cap|budget|max requests|uncertain|planning-only|caller abort' tests/discord-summaries.test.mjs
```

## Independently verified behavior

- Plaintext commentary, schema-valid commentary, and commentary containing foreign citations are ignored before/after the actual final message. Only the final summary is returned.
- Absent/null phases retain legacy eligibility; existing single-message bare-content/type-only fixtures remain compatible. Multiple fragments concatenate exactly within one selected message, without combining separate messages.
- Commentary-only, unsupported/empty/numeric phases and missing/null/empty output yield no summary. Duplicate final answers, duplicate unphased answers, final-plus-legacy and JSON fragments spread across messages reject ambiguity rather than infer a phase or select by position.
- Malformed/schema-invalid final JSON, refusal or mixed refusal/text, incomplete/in-progress/bad selected status, absent/empty content, empty/non-string text and unsupported fragments fail closed. Valid commentary is never used as fallback. Whole-response incompletion also rejects a completed-looking final message.
- Explicit nonassistant roles and tool/function/reasoning item types cannot become answers. They are ignored alongside a valid assistant final. Missing role outside the narrowly permitted single legacy fixture is rejected.
- Usage retains the full response totals, including commentary, cached tokens and observed cost; it is not reduced to the selected message. Valid observed usage remains charged on parser rejection. Oversized unparsed raw responses retain unknown/full-reservation accounting.
- Ignored 40000-byte commentary does not consume the selected-text byte allowance. Selected 32769-byte JSON is rejected even with valid commentary. Existing exactly 32768-byte selected acceptance still passes. Total raw 262144 bytes is accepted; 262145 bytes is rejected before parsing with unknown usage retained.
- All existing strict enum, schema, default service tier, reasoning-none, 3200 output ceiling, $1/$5/request limits, request cancellation/retries and data-scope guards pass. Targeted cache checks include the genuine009 780-original/37-stage mocked-Responses fixture; cached publication retains receipts and uses 0 new dispatches.

## Findings / limitations / handoff

No material implementation finding. No SQL scale or broad integration repeat was needed for this provider-only parser change. All model output was synthetic; this pass does not establish actual OpenAI response quality, historical bootstrap completion, production deletion or Railway health.

**Verdict: PASS for local parser acceptance.** Root owns folder-guide/journal updates and should record this pass with evaluator acceptance before resuming the existing operation under unchanged caps. The OpenAI Docs skill was read at `/Users/yuyang/.codex/skills/.system/openai-docs/SKILL.md`; no key or API-backed production tool was invoked.
