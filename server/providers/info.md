# Model protocol adapters

Adapters for OpenAI-compatible chat completions and Anthropic messages normalize streamed text, completion, cancellation and errors. Optional bounded planning calls let the selected model choose up to two server-owned Discord retrieval tools; filters are validated and trusted member scope stays outside model arguments. Configuration is server-only with no chosen model or key. Local protocol and Hono fixture tests pass; real provider calls remain unverified. See [Discord archive setup](../../docs/discord-archive.md).

`LLM_PROVIDERS_JSON` optionally supplies an ordered list of one through eight
explicit API base URLs/keys, each with a supported protocol and model (or those
two values inherited from `LLM_PROVIDER`/`LLM_MODEL`). Any invalid nonblank list
makes model configuration unavailable; absent/blank lists keep legacy settings.
The public `createProvider` API and injected transport/audit/retry dependencies
stay unchanged. Chat and planner share its `toolTurn`, `planTools` and `stream`
router. Each candidate rebuilds its own native request and uses its own parser.
See [provider routing](../../docs/provider-routing.md) for private configuration.


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
at most three HTTP attempts per entry, with one- and three-second backoff, under
one original configured timeout and caller cancellation signal for the entire
ordered chain. Only HTTP 408/429/500/502/503/504
(plus Anthropic 529) and explicitly allowlisted pre-response network errors retry.
A valid Retry-After can lengthen the wait; retries stop when that wait cannot fit
within the remaining deadline. HTTP401/402/403/404, confirmed exhausted credits and
other5xx advance without extra same-entry retries. Temporary failures advance
after their bounded retries when budget remains. Other client errors and unknown
transport failures stop the operation. Rejected429 envelopes are read up to16KiB
only to recognize exact `credit_balance_exhausted` or `insufficient_quota` values
under `error.code`, `error.type`, `code` or `type`; ordinary429s keep their retries.
Only those fixed codes can enter audits; bodies are discarded. This quota
classification also prevents redundant legacy one-provider retries.
Response bodies from rejected attempts are cancelled.
Each attempt has its own durable audit start and finish, with a shared run/round
context and actual provider/model/hostname. Every JSON-list key participates in
private audit redaction, including bare echoed keys. Credentials, prompts and
upstream error bodies remain excluded from audit.
Successful-response decoding, malformed UTF-8/JSON/SSE, generated error responses,
tool validation/execution and partial answer streams never replay. Any HTTP2xx
commits to that entry, including failures before the first answer token. Local
validation/attachment errors, required audit-start failure and caller abort never
route. Planning and
streaming now enforce the configured timeout directly, as native tool turns do.
Audit persistence retains its own existing timeout and mandatory start behavior;
its latency consumes the inference budget, and dispatch rechecks that deadline
before every actual HTTP request. No audit timeout is changed. Terminal audit
failure preserves the original provider result/failure.
`retrySleep` is an optional dependency-injection seam for local tests; it changes
neither the production attempt limit nor the deadline checks. No runtime setting,
provider SDK, model choice or deployment is introduced by this change.

Native toolTurn response validation now records fixed parser causes, including proposals above the caller-selected limit, malformed argument JSON, invalid shapes and reused IDs. These remain failures under the selected cap and are never retried after a successful response. Only sanitized operational correlation and codes enter agent_model_failure logs; private model audit retains the fixed diagnostic alongside its already-authorized returned output.

The native planning catalogue accepts at most 64 tool definitions so the full source catalogue including opt-in Attio fits. This is a definition bound only: response call parsing and the shared chat call/round budgets retain their existing limits.


Native toolTurn accepts a trusted local maxToolCalls option: default8, integer1
through16. It validates both previous assistant tool-call messages and the new
provider reply using the same limit for OpenAI-compatible and Anthropic formats.
The option is never sent in the HTTP request body. The update worker selects16;
ordinary chat remains at8. planTools retains its independent8-call parser limit.
Malformed arguments, duplicate/reused IDs, response bounds, audits and retries
retain their existing behavior.

`planner-cache.js` applies only to planner tool turns on reviewed direct OpenAI GPT-6 Luna/Sol configurations. It removes per-run reference enums from provider-visible schemas, retains exact handler validation, marks the fixed instruction boundary and keeps fresh clock information in a separate trusted system message. Normal implicit caching remains enabled; chat, Anthropic and other compatible hosts keep their existing wire format. Cache-reuse savings require measured usage; changing prefixes can increase writes.
