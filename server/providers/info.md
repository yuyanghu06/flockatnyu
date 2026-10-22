# Model protocol adapters

Adapters for OpenAI-compatible chat completions and Anthropic messages normalize streamed text, completion, cancellation and errors. Optional bounded planning calls let the selected model choose up to two server-owned Discord retrieval tools; filters are validated and trusted member scope stays outside model arguments. Configuration is server-only with no chosen model or key. Local protocol and Hono fixture tests pass; real provider calls remain unverified. See [Discord archive setup](../../docs/discord-archive.md).


Official-host gpt-6-luna/gpt-6-sol tool planning sets reasoning_effort:none because Chat Completions requires it for function calls. Other hosts/models/providers and answer streaming keep existing behavior. Actual Luna live retrieval smoke and six compatibility regressions verify this boundary.

`toolTurn` supplies bounded nonstreaming native tool turns for background automation and text-only shared chat (up to32definitions for the current26toolchatcatalogue);
existing `planTools` and answer streaming retain their behavior. Normalized
assistant tool calls preserve IDs; tool results are converted to OpenAI
`tool_call_id` messages or immediately following Anthropic `tool_result` blocks.
Truncation, unsupported stop reasons, malformed/duplicate call IDs and oversized
responses fail closed. Tool authorization, schema checks and execution remain in
the server handler. No provider/model is chosen and no live calls were made for
this addition. Protocol references: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [Anthropic tool-call handling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).

Chat planning and answer streaming convert validated user attachments into native OpenAI Chat Completions image_url, PDF file_data or quoted text blocks. Native toolTurn remains text-only; chat conversations with uploads retain planTools so the existing attachment conversion is preserved. The implemented Anthropic path rejects attachments before network dispatch rather than sending an incompatible schema. No Files API resource or durable upload is created.

All three dispatch paths now write private model audit starts/results with run/round context, sanitized returned text/proposals and nullable usage/IDs. OpenAI streaming requests usage and reads its trailer; abort/early-return preserves partial output. Audit failure before production dispatch blocks the call; terminal-write failure preserves the provider result and leaves unresolved start. See ../../docs/model-audit.md.

Actual provider cache_write_tokens is retained separately from cached reads; known direct Luna pricing partitions total input across uncached/read/write categories. Missing counts or inputs above272K remain unpriced.

All three operations share bounded inference retries in `index.js` and `retry.js`:
at most three HTTP attempts, with one- and three-second backoff, under one original
configured timeout and caller cancellation signal. Only HTTP 408/429/500/502/503/504
(plus Anthropic 529) and explicitly allowlisted pre-response network errors retry.
A valid Retry-After can lengthen the wait; retries stop when that wait cannot fit
within the remaining deadline. Response bodies from rejected attempts are cancelled.
Each attempt has its own durable audit start and finish, with a shared run/round
context. Credentials, prompts and upstream error bodies remain excluded from audit.
Successful-response decoding, malformed UTF-8/JSON/SSE, generated error responses,
tool validation/execution and partial answer streams never replay. Planning and
streaming now enforce the configured timeout directly, as native tool turns do.
`retrySleep` is an optional dependency-injection seam for local tests; it changes
neither the production attempt limit nor the deadline checks. No runtime setting,
provider SDK, model choice or deployment is introduced by this change.

Native toolTurn response validation now records fixed parser causes, including more than eight proposed calls, malformed argument JSON, invalid shapes and reused IDs. These remain failures under the existing cap and are never retried after a successful response. Only sanitized operational correlation and codes enter agent_model_failure logs; private model audit retains the fixed diagnostic alongside its already-authorized returned output.

The native planning catalogue accepts at most 64 tool definitions so the full source catalogue including opt-in Attio fits. This is a definition bound only: response call parsing and the shared chat call/round budgets retain their existing limits.
