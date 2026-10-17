# Model protocol adapters

Adapters for OpenAI-compatible chat completions and Anthropic messages normalize streamed text, completion, cancellation and errors. Optional bounded planning calls let the selected model choose up to two server-owned Discord retrieval tools; filters are validated and trusted member scope stays outside model arguments. Configuration is server-only with no chosen model or key. Local protocol and Hono fixture tests pass; real provider calls remain unverified. See [Discord archive setup](../../docs/discord-archive.md).


Official-host gpt-6-luna/gpt-6-sol tool planning sets reasoning_effort:none because Chat Completions requires it for function calls. Other hosts/models/providers and answer streaming keep existing behavior. Actual Luna live retrieval smoke and six compatibility regressions verify this boundary.

`toolTurn` adds a separate bounded nonstreaming tool loop for background automation;
existing `planTools` and answer streaming retain their behavior. Normalized
assistant tool calls preserve IDs; tool results are converted to OpenAI
`tool_call_id` messages or immediately following Anthropic `tool_result` blocks.
Truncation, unsupported stop reasons, malformed/duplicate call IDs and oversized
responses fail closed. Tool authorization, schema checks and execution remain in
the server handler. No provider/model is chosen and no live calls were made for
this addition. Protocol references: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [Anthropic tool-call handling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).
