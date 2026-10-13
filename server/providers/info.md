# Model protocol adapters

Adapters for OpenAI-compatible chat completions and Anthropic messages normalize streamed text, completion, cancellation and errors. Optional bounded planning calls let the selected model choose up to two server-owned Discord retrieval tools; filters are validated and trusted member scope stays outside model arguments. Configuration is server-only with no chosen model or key. Local protocol and Hono fixture tests pass; real provider calls remain unverified. See [Discord archive setup](../../docs/discord-archive.md).
