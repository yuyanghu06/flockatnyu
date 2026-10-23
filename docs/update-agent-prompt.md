# Update-agent prompt

The runtime source is [server/automation/prompt.js](../server/automation/prompt.js).
The autonomous planner/update agent handles cached authorized Discord/Gmail
messages. Chat has separate prompts and keeps its own read-only Miro capability.

## Responsibilities

1. Interpret incoming originals and make their supported Calendar changes.
2. Update people's participation/location on the appropriate existing map events.

There is no worker Miro integration, board preflight or per-batch board duty.
Irrelevant inputs may finish without unrelated Calendar scans or map upkeep.
The model does not perform broad rolling Calendar-to-map reconciliation or repair
mechanical API failures. Deterministic Calendar APIs own projection and pagination.

## Staged cycle

The existing trigger remains30eligible inputs OR oldest eligible age30minutes.
One lease covers the initial model phase, deterministic club/Member Plans
Calendar-to-map APIs and at most10follow-up model turns. Empty polls do not
invoke models. Existing per-turn, phase and run bounds remain unchanged.

The initial phase interprets queued originals and updates the pinned club or
Member Plans Calendar. New personal plans/current presence still originate in
Member Plans; this simplification introduces no map-only personal creation path.
The deterministic phase copies actual Calendar occurrences, preserves independent
participants/human edits and uses fixed building aliases. The follow-up phase
handles source interpretation, participation and ambiguous location tasks using
actual results. Mechanical API outcomes stay visible without assigning broad
synchronization repair to the model. Successful follow-up Calendar mutations
receive deterministic projection.

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
authorized queued message. Before a mutation, the adapter rereads the original
and rejects changed body/sender/source bindings. Same-message revisions retain
the same identity. Ambiguous cross-source matches defer.

Before a club upsert, read a complete unfiltered full-mode Calendar window
covering the actual target start, including dates outside the deterministic
window. Preserve human-created/edited events and defer conflicts. Cancellation
requires clear current cancellation of the same managed event; missing objects,
message deletion, partial scans and RSVP declines do not authorize cancellation.
No attendees, invitations, recurring creations or unrelated source writes.

Map people require successful source-bound lookup_map_person for the actual
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
