Current prompt workflow: initial `savedTaskCoverage.inputs` gives only matching queue refs and saved-task counts, without task IDs/content or new live evidence. After a source outage, explicitly finish the covered queue ref with `noChangeInputIds:[]`, retain its task, and finish follow-up normally once other ready work is done. The separately named post-finish sync result stays visible after transcript reset.

# Update-agent prompt

The runtime source is [server/automation/prompt.js](../server/automation/prompt.js).
The autonomous planner/update agent handles cached authorized Discord/Gmail
messages. Chat has separate prompts and keeps its own read-only Miro capability.

## October 26 selected fixes

Current local implementation separates task decisions from business writes.
`resolve_pending_task` accepts `completed`, `no_change_needed` and `source_missing`.
No-change uses reason `already_correct` or `no_actionable_request`, a complete
current task read and current observations of its originals; already-correct work
also needs relevant current target-state evidence. It does not manufacture a
write receipt. Successful task deletion reports its actual `resolutionOutcome`.
Unknown or failed work and newer task versions stay saved.
The latest read of that matching target must itself support the decision; a
successful read of another event cannot hide the target's later failure.

A verified unchanged participation operation returns a successful no-change
review result with `changed: false`, not a claimed applied write. It offers
copyable resolution choices; the runner formats those choices with current task
refs. Known already-correct active tasks still need their explicit resolution
before ordinary follow-up completion. Initial saved-task coverage also includes
copyable queue-finish arguments, and its no-change choices exclude originals
already covered by saved work.

An exact Discord message GET returning 404 after normal source/bot authorization
can return `ready` with `outcome: source_missing`. The worker accepts this only for
the exact trusted original it was asked to read. Initial `missingInputIds` must be
a subset of `handledInputIds`; saved tasks are separately read and resolved at
their exact versions, and mixed tasks survive unless all originals are missing.
Permission failures, timeouts, empty searches and incidental missing messages do
not authorize task deletion or Calendar/map changes.

Prepared inputs and compact task views include copyable `sourceHints`. Worker map
results include `participationTargets` outside the normalized event rows. The
prompt distinguishes canonical original URLs, native authors, source UUIDs, map
UUIDs and provider Calendar IDs. These hints perform no calls and add no grants.

The active model conversation may retire unused result bodies and optional
historical page prefixes while keeping complete compact task intent, current
facts, exact references and issued continuation state. Retired historical bytes
are not a reconstructed full JSON value. Private execution/audit evidence and
the existing hard limit remain separate and unchanged.

Invented page IDs still fail through the unchanged reader. Old-log cleanup and
other unselected corrections remain held. Verification and release status live
in [the selected-fix milestone](../milestones/planner-selected-fixes-2026-10-26/info.md).

## Responsibilities

1. Interpret incoming originals and make their supported Calendar changes.
2. Update people's participation/location on the appropriate existing map events.

There is no worker Miro integration, board preflight or per-batch board duty.
Irrelevant inputs may finish without unrelated Calendar scans or map upkeep.
The model does not perform broad rolling Calendar-to-map reconciliation or repair
mechanical API failures. Calendar pagination stays inside its named read. Projection is the separately registered `sync_calendars_to_map` operation, explicitly authorized as an exception to isolated service tools.

## Staged cycle

The existing trigger remains30eligible inputs OR oldest eligible age30minutes.
One lease covers the initial model phase, a separate recorded `sync_calendars_to_map` call after successful initial `finish_batch`, and at most10follow-up model turns. Empty polls do not
invoke models. Existing per-turn, phase and run bounds remain unchanged.

The initial phase interprets queued originals and updates the pinned club or
Member Plans Calendar. New personal plans/current presence still originate in
Member Plans; this simplification introduces no map-only personal creation path.
The deterministic phase copies actual Calendar occurrences, preserves independent
participants/human edits and uses fixed building aliases. The follow-up phase
handles source interpretation, participation and ambiguous location tasks using
actual results. Mechanical API outcomes stay visible without assigning broad
synchronization repair to the model. Ordinary Calendar and Member Plans writes do not invoke projection. When a later change needs projection, the prompt directs a separate `sync_calendars_to_map` call or separate Calendar/map reads and an explicit map write. Reaching the initial round cap does not invoke synchronization.

## Evidence and identity

Source content, temporary cached context and execution results are untrusted data.
Current permissions and exact original evidence remain required. Prioritize
queued eboard messages and read exact current Discord originals before acting;
additional context is targeted, without routine historical channel sweeps.

Clear announcements/changes are interpreted semantically, without mandatory
club/event/scheduled keywords. Club mutations use an observed exact
`discord:<guildId>:<channelId>:<messageId>` or `gmail:<messageId>` plus its
canonical original URL. A Gmail search snippet or metadata cannot authorize a
body-dependent mutation: read_gmail must return actual bounded text for the exact
authorized queued message. Source reading is an explicit agent-selected operation. Writes use already returned source/identity facts and local validation; they do not fetch originals or look up people internally. A newer failed explicit read invalidates the corresponding reusable source observation. Same-message revisions retain
the same identity. Ambiguous cross-source matches defer.

The prompt directs the agent to read a complete unfiltered full-mode Calendar window before a club upsert
covering the actual target start, including dates outside the deterministic
window. Preserve human-created/edited events and defer conflicts. Cancellation
requires clear current cancellation of the same managed event; missing objects,
message deletion, partial scans and RSVP declines do not authorize cancellation.
No attendees, invitations, recurring creations or unrelated source writes.

Map reads and identity lookups access only saved map database data. Map writes access only the database write transaction, using the saved snapshot returned by a separate read for preservation and optimistic checks. Source authorization is checked locally against the principal and current saved scope; no provider-original fetch occurs inside a map call.

For a supported participant change, the prompt directs a successful source-bound lookup_map_person for the actual
Discord author or Gmail sender. Names, organizers, helpers and mentions establish
no attendance. Read existing state, merge complete snapshots and preserve
independent people, Calendar-owned facts and optimistic revisions. Do not guess
identities, buildings, times or verified physical presence.

## Time, tasks and completion

Use original provider timestamps/timezones for relative dates. An explicit
current-location report with no end expires at original start +2hours; partial
edits do not refresh expiry. Personal future plans need supported ends. A club
timed event with a known start may use the approved +2hours missing-end default,
preserving an existing end. All-day ends are exclusive; unknown starts defer.

Temporary tasks retain authorized original IDs, speaker/channel/timestamps,
preceding context actually read and actual execution outcomes. They are a bounded
service-only buffer, never a durable source archive or audit-retrieval tool.
Use read_pending_task before modifying a task. It returns the saved task only;
it does not reread sources or preflight Calendar. Listing and saving tasks also
perform no task-related live reads. The model then chooses standard Discord/Gmail
reads, Calendar reads/updates and map read/person-lookup/update tools as needed.
Current source scope and cache expiry still apply. The normal action tools retain
their own checks; reading cache creates no fresh identity or write receipt.
Resolve only after required work succeeds; untouched/unresolved versions survive errors, crashes and caps.

Follow-up keeps one or two distinct tasks active at a time. The complete lightweight
catalogue and numbered task references have the same order: current-cycle tasks
first, then participation within each group. The model finishes those ready
actions and resolutions before loading more tasks. An actual missing fact,
unavailable source or unmatched identity leaves that task pending and frees its
slot for another ready task. Blocked current-cycle work must not prevent ready
peers from proceeding. Older work follows current-cycle ready work within the
existing bounds; this selection belongs to the prompt, without a new runner
workflow or cross-service call.

For those selected tasks, the prompt batches independent missing original,
own-author identity and exact-map reads when their arguments are already known.
The first patch for a new participant includes both endpoints; attendance for the
whole event explicitly uses `start:{inherit:true}, end:{inherit:true}` when both
boundaries match that person's intent. An optimistic map conflict keeps the task
active: reread the exact map event, preserve concurrent human fields and retry the
supported patch against its fresh parent revision. A stale map revision alone
does not justify rewriting or rereading an unchanged task. Genuine changed
originals or targets still require the normal task update and new-version proof.

`read_pending_task` accepts `taskId` and optional `detail: "compact" | "full"`.
Compact is the default and preserves the exact task UUID/timestamps, version,
source IDs/references, request and original inputs. It includes only the small
saved Calendar routing fields needed to choose separate tools. It does not repeat
historical batch context or execution logs. A returned notice gives the retained
history count and explains how to request full detail. This is a read projection:
the stored task, originals and history remain unchanged. The model requests full
detail only for a specific necessary conversational fact missing from compact and
current returned results. Full detail returns the unchanged saved task, losslessly.

Either selected view may fragment when genuinely large. Read every returned piece
of that view before relying on it. A complete compact view establishes the normal
exact-task-version read prerequisite; optional historical logs need not be loaded
before acting. Read receipts remain bound privately to the complete canonical
saved snapshot, while disclosure checks compare actual result/fragment bytes with
the selected projection. Starting or partially reading optional full history does
not revoke or refresh an existing compact receipt for the same snapshot. Changed
snapshots still require a new complete read and new successful action evidence.
No cache read fetches source, Calendar or map data.

Ordinary tools use `{inputIds,arguments}`. `finish_batch` instead takes bare
`{handledInputIds}`. Use actual queue/task UUIDs supplied by the
runtime, exact returned provider IDs and actual fragment continuations. Tool
proposals and already_succeeded receipts do not invent a current result.
finish_batch is the sole call in its turn; handledInputIds contains queue UUIDs
only; the follow-up may use an empty list when no queued originals remain to settle.
A clearly irrelevant input is handled without a mutation or task; include its queue UUID.
Complete handled inputs or work durably transferred to an eligible task.
Unsupported work remains pending. Budget exhaustion never permits deletion.

## Tool errors returned to the model

A tool that fails, throws an ordinary exception, returns null/malformed data or exceeds the result size limit returns a small `tool_error` with a fixed safe reason. The runner supplies it under the original call ID and continues other valid calls. Raw error text and failed response bodies are excluded. Failed writes do not receive successful action receipts; an unclear external write outcome requires checking actual state before retrying. Global cancellation/deadline, real lease/receipt failure, current run authorization failure and unavailable required audit storage still stop processing. Invalid model-proposed arguments remain a separate existing rejection path. Worker call limits are16per model reply and64per stage, including finish_batch; initial/followup stage totals reset independently (up to128across both). Shared chat defaults remain unchanged. Model rounds, overall deadlines and output-token allowance are unchanged.

The [October 22 audit](prompt-audit.md) aligns task instructions with their actual
schemas. Both a new `defer_task` and an update with `taskId` require a nonempty
`summary` and valid `operation`; original context and execution outcomes are
retained automatically. Read a saved task before updating it, preserve known IDs
and omit unsupported or unknown optional fields. Production does not expose an
unsupported obsolete resolution choice. Unresolved tasks remain under existing
retention and completion checks. The compatibility prompt cannot create personal
activities directly on the map or invoke a Member Plans tool it does not have.
Drive copying directions name chat-only Calendar tools only in the chat context;
Drive content does not grant worker write authority.


## Isolated completion tools

`resolve_pending_task` uses the exact loaded task version and already returned evidence for its chosen result. `completed` retains matching applied-operation proof; `no_change_needed` is a separate explicit review decision with current source/target evidence; `source_missing` uses the exact authorized missing-original witness. It performs only the task-store compare-and-delete; no Calendar, map or source read happens inside resolution. If additional state is needed, the model chooses a separate read first. Failed, unrelated or stale evidence cannot clear work.

`finish_batch` validates declarations and records queue/lease bookkeeping. The explicit user-authorized exception is a **separate registered and recorded** `sync_calendars_to_map` call after a successful initial finish. It has its own arguments, result, audit/action receipt and tool budget charge and is identified as runner-originated rather than a fabricated model proposal. The subsequent phase transition loads saved tasks only. No automatic synchronization is attached to an ordinary Calendar/Member Plans write or a model-round cap.
