# Application prompt audit — October 22, 2026

The attendance failure exposed instructions that still described retired tools. This audit covers every active application instruction source, including descriptions and messages supplied to the model after a tool runs. It compares those instructions with the tools actually available and the current user decisions. Historical fixtures and external developer skills are preserved separately.

## Coverage

| Area | Active instruction sources reviewed |
| --- | --- |
| Model dispatch | `server/providers/index.js`: native tools, attachment planning and final answers; `server/discord/summary-provider.js`: temporary Discord summary map/reduce |
| Chat | `assistant-context.js`, `chat-behavior.js`, `chat-request-context.js`, `chat-discord-context.js`, `chat-attachments.js`; planning, reminders, final answers, trusted clock, reply/image/upload context |
| Calendar chat | `calendar-chat-prompt.js`, Calendar chat tools, boundaries, batch descriptions and receipt notices |
| Map chat | Normal read/person lookup/upsert descriptions, contracts, saved-result projection and remaining action reminders |
| Update worker | Automation prompt, handler, adapters, staged pipeline, task catalogue/tools, Member Plans descriptions, execution history and bounded-result fragments |
| Shared source tools | Discord live reads/summaries/drafts, Google and Calendar, Miro navigation/MCP notices, Attio, memory and bug reports |
| Injected guidance | Drive skill loader and deployed `server/skills/techatnyu-drive/SKILL.md` |

The planner inventoried both dispatchers. Independent chat and worker reviewers inspected these instruction sources. No material mismatch was found in attachment handling, stable Calendar exposure, Discord summary instructions, Attio targeting, memory/bug tools or Miro read-only operation.

## Corrections being implemented

| Finding | Required behavior |
| --- | --- |
| A keyword reminder could command a map write inside a quoted question | Remove the keyword flag and imperative reminder; interpret the actual request and preserve clarification context |
| Runner suppressed identical reads even after a write conflict | Permit a narrowly bounded fresh read after an observed conflict; retain revision checks, budgets and mutation deduplication |
| Discord context described retired map source receipts | Direct chat uses the verified actor or an unambiguous supplied name through normal tools; source visibility and retrieved-content trust rules still apply |
| Final answer lacked details of an applied map update | Provide bounded details from the actual applied submitted snapshot, clearly distinguished from an independent readback |
| Date shorthand advice applied to Calendar too | Calendar receives explicit timezone-correct RFC3339 bounds; tools supporting shorthand retain it |
| Miro's `contentAvailable` rule appeared to govern every source | Scope it to Miro content and navigation |
| `defer_task` directions did not match required arguments | Include `summary` and `operation` for both new and updated tasks; explain automatic context capture and exact wrappers |
| `finish_batch` wrapper and empty-list schema contradicted follow-up behavior | Advertise its real bare arguments and phase-specific completion rules |
| Task resolution offered an outcome production always rejects | Stop advertising unsupported obsolete resolution; unresolved work remains retained under existing rules |
| Drive guidance named a chat-only Calendar tool for workers | Scope chat copying to available chat tools; worker source authorization remains Discord/Gmail |
| Worker Calendar descriptions still mentioned Miro evidence | Describe its actual Discord/Gmail evidence requirements |
| Nonstaged worker prompt allowed old personal map creation | Remove that direction; do not invent an unavailable Member Plans tool |
| Staged worker left a clearly irrelevant greeting queued | Explicitly count inspected no-action inputs as handled; include their queue IDs without creating tasks |
| Fragment notice falsely claimed every other read was fresh | Explain saved cache contents separately from batch-local fragments |

## Verification and release

All identified instruction mismatches are corrected and independently accepted.
Tester checks pass (116), with independent chat (90) and worker (185) checks.
API build, syntax, whitespace and package/source matching pass. These suites overlap;
the counts are separate runs, not a unique-case total.

Five configured-model scenarios pass using simulated source/storage operations:
quoted map commands do not write; attendance preserves event facts and receives
clear confirmation; Calendar uses the correct 25-hour daylight-saving window;
conflict recovery preserves a human correction; and a worker reads saved work,
receives a standard source error, saves valid same-task progress and retains it.
Two earlier worker runs left an irrelevant greeting queued. Their traces remain
recorded; an explicit no-action completion instruction fixed the problem. All runs
used 35 inference requests under a revised ceiling of 40.

Reviewed web `a87b4929-1311-4488-b76f-68f827c3f48c` and worker
`6434b07e-2e98-4bc8-a134-9e449dc305a0` are deployed SUCCESS. Production health, login redirect and unauthenticated API
denial checks pass; the worker started and prepared a batch successfully. No collector, environment or schema change was needed. Worker limits
remain 16 calls per reply and 64 per stage; chat limits remain unchanged.
[Content-free results and source hashes](../evidence/prompt-audit/results.json)
distinguish accepted cases, earlier failures and release state. Simulated writes
and public startup checks do not establish a live Calendar/map change.

## Subsequent cancellation-completion fix

The audit found that saved source-review task completion recognized upserts but
omitted cancellation tools. The user subsequently authorized fixing that code.
Worker `8ee19715-041f-4ad4-b26c-3c0f10d74019` is deployed SUCCESS: exact confirmed
club/Member Plans cancellations can now resolve their matching task. Explicit
authorized already-absent outcomes require a successful exact empty read. Failed,
mismatched, uncertain or stale outcomes retain the task. Existing cache reads,
source/identity permissions and budgets remain unchanged.

Independent integration checks pass and review accepts the adapter-only fix.
Tests used simulated provider/storage; no real event was cancelled.
[Cancellation evidence](../evidence/cancellation-task-completion/results.json)
records this separate backend release rather than attributing it to prompt edits.
