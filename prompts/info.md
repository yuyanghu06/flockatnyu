# Model prompts

All server-authored model instructions live here. JavaScript chooses fixed blocks,
supplies runtime values and performs validation and tool execution. Source text,
user messages, dates, IDs and returned records remain data supplied by code.

- `agents/chat/`: tool selection, final answers and request-context guidance.
- `agents/update/`: initial/follow-up/legacy worker instructions and recovery.
- `tools/<service>/`: named tool descriptions, field guidance, chat workflows,
  source navigation and model-visible result notices.
- `shared/`: trusted time, capability and shared-memory guidance.
- `legacy/`: retained exported helpers without active runtime call sites.

## Editing and loading

Each file groups named blocks by purpose. A block starts with
`<!-- prompt: block-name -->` on its own line and ends with `<!-- /prompt -->`.
Only the text between those delimiter lines enters the model request; headings
and explanation outside blocks do not. The newline immediately inside each
delimiter is framing, while every payload space/newline is preserved. Intentional
trailing spaces keep separately assembled sentences separated. Git preserves LF
line endings and allows those spaces specifically for this folder. Avoid running
a Markdown formatter over block payloads during a behavior-preserving move.

Call `promptText('tools/calendar/create_calendar_event#description')` from server
code. `{{namedValue}}` slots take explicit values from that call, substituted
exactly once as plain text. Inserted JSON/source text is never parsed as another
template. Missing/extra values, unknown blocks and unregistered paths fail.
No JavaScript expressions are evaluated from Markdown.

Register new files in `server/prompt-loader/assets.js`, then use fixed literal
references. Only referenced, allowlisted files enter each source-only service
package. Evaluation source copies include the complete prompt asset registry.
The loader resolves from its module location, independent of the shell directory.
Assets are cached for the process: restart the service after edits.

## Verification and limits

This extraction preserves the pre-migration wording, inclusion order and dynamic
values. In particular, the existing Drive/Calendar duplicate-check conflict is
unchanged; moving text does not resolve it. Structural schemas, permissions,
leases, exact versions, budgets and workflow execution remain in JavaScript.
Application AGENTS.md and behavior documentation are development references, not
runtime prompt assets. Future wording edits use the project's normal prompt
behavior verification; this migration uses exact output comparisons and offline
runner/package checks without paid model or provider calls.

The October28 planner optimization keeps reusable staged instructions first and appends the `agents/update/core#staged.clock` block as fresh trusted context. Supported direct OpenAI requests split that clock into a separate system message; other adapters retain complete prompt text. WRAPPED ARGUMENTS clarifies that service fields belong inside a wrapper's `arguments`, while finish_batch retains its own schema. Verification lives in the cost-reduction milestone; no provider/model/runtime cap changes follow.
