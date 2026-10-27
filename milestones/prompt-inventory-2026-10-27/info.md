# Current chat and update-agent prompt inventory

Goal: explain every current model instruction layer and its runtime source.

Scope: read-only code tracing in the dev/tool-api-services checkout. Includes
chat planning and answer prompts, update-agent legacy/initial/follow-up prompts,
shared instruction helpers, dynamic context, tools/argument descriptions, recovery
feedback and the separate on-demand Discord summary model. No wording changes.

Completion criteria: trace actual model request assembly, distinguish reference
docs and unused helpers from active code, obtain independent review and report
material drift with source references.

Status: COMPLETE for source inventory; independent evaluator ACCEPT. This is not
behavioral verification or verification of deployed copies. No tests, inference,
provider calls, business writes, deployment, commit or push occurred.

## Current source map

- Chat tool selection: server/chat/prompts/planning.js:35; final reply:
  server/chat/prompts/answer.js:47. Both use server/chat/behavior.js,
  server/chat/prompts/policies.js, server/google/calendar-chat-prompt.js and
  server/chat/prompts/time.js. Website and Discord share the runner.
- Chat injected guidance/data: server/chat/{request-context,discord-context,
  contact-context,capabilities}.js, server/knowledge/memory.js and
  server/miro/navigation.js. Result/history wrappers supply actual bounded
  evidence, receipts, coverage and follow-up instructions.
- Update agent: server/automation/prompt.js:27 selects legacy versus staged
  builders; staged common, initial and follow-up rules begin at47/105/114.
  handler.js:136/279 builds them and402 submits system/messages/tool definitions.
  Worker has no separate final-answer prompt. Actual staged flag is unverified.
- Worker tool/context/feedback instructions also live in automation/adapters.js,
  staged-pipeline.js, bounded-result.js, conversation-context.js and handler.js.
  The separate automatic post-initial-finish sync is runner behavior; subsequent
  named tool sequencing is prompt-directed.
- Conditional shared Drive asset: server/skills/techatnyu-drive/SKILL.md, loaded by
  server/skills/drive.js. Selected Drive calls activate it before execution.
- Tool and field descriptions: mostly server/*/operations, plus worker tool
  definitions and server/map/contracts.js schemas. tools/* are mainly clients.
- Separate Discord summary instructions: server/discord/summary-provider.js:15,
  submitted at36 with a strict cited JSON schema.
- server/providers/index.js serializes assembled instructions/definitions; it
  adds no independent behavior policy. docs/chat-agent-prompt.md and
  docs/update-agent-prompt.md are reference prose, not loaded runtime prompts.
  server/map/contracts.js:132 buildMapRecordPrompt has no runtime call site.

## Known finding and limits

The active Drive skill at line33 says batch Calendar creation checks duplicates
itself. server/google/calendar-chat-prompt.js:2/5 requires a separate Calendar
listing and says creation does no hidden search. Both can be injected together;
the Drive skill is appended later. This contradiction is reported, not repaired.
The chat prompt guide still points at context.js, now only a re-export facade.

Prior unmatched-attendee intent preservation failure and local Calendar/Member
Plans verification limits remain open in the rolling milestone. Inventory does
not establish model compliance, deployment parity or current live flag values.

Next action: deliver the requested source summary; wording fixes or further model
verification require a separate scoped task.
