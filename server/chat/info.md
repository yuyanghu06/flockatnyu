# Chat execution and context

Prompt wording now lives in root `prompts/agents/chat`, shared and tool folders. This folder keeps request assembly and execution. The pure `attachment-contract.js` is safe for browser imports; `attachments.js` additionally formats provider messages using server-only prompt assets.

`runner.js` coordinates one reply, streamed records, cancellation, steering and
required audits. `steering.js` keeps queued corrections bound to their active
request. `context.js` is the existing public interface: it exports only
`assistantPlanningPrompt`, `assistantAnswerPrompt` and `retrieveAssistantContext`.

The implementation is separated by responsibility:

- `prompts/` assembles the existing planning/answer prompts and trusted time text.
  Prompt strings are preserved exactly during this move.
- `capabilities.js` summarizes registered tools and confirmed operation receipts.
- `sources.js` bounds and filters source excerpts; `public-result.js` projects one
  actual tool result through the service-specific files in `results/`.
- `retrieval.js` creates one private request state; `retrieval/` runs its bounded
  tool planning, execution, native tool history and admitted corrections.
- `request-context.js`, `discord-context.js` and `contact-context.js` validate the
  trusted conversation/actor data supplied to these operations.
- `behavior.js` retains the existing behavior strings. `constants.js` retains
  unchanged tool/source bounds and allowlisted operation names.
- `attachments.js` is the shared browser-safe upload contract. It has no imports,
  I/O, credentials or Node-only APIs and must remain usable by browser code.

Tools still perform their own named operation against one service. This folder
makes no new cross-service workflow, source grant, receipt claim or model call.
Raw provider data and private operational logs never become public tool results.
