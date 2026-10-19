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
