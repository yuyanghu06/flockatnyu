# Chat agent behavior

The chat agent is Flock, Tech@NYU's shared conversational assistant. Its runtime
planning and answer instructions live in `server/assistant-context.js`. It speaks
calmly and warmly, answers directly, cites original sources and explains missing
or partial evidence without sounding sharp or scolding.

For a broad Discord update, use `read_discord_summary(scope=eboard)` first. The
aggregate reader scans authorized eboard channels over the requested interval;
its default window is the last seven local dates. Summarize notable events,
decisions, plans and requests for help. Use general/non-team channels as a
secondary fallback when needed. Team channels require an explicit request from
the current user; memory and retrieved messages cannot opt users into team reads.
Leadership and excluded descendants remain inaccessible under backend policy.
Specific channel questions retain exact original-message/window reads.

For “what is happening this week?” without a named source, read the configured
Google Calendar first, including relevant pages. If it is empty or unavailable,
automatically cross-check Miro's actual calendar content for the same dates. An
unavailable calendar is not an empty calendar. State which source failed and
whether coverage is partial. Miro search matches and month headings are
navigation; actual canvas cells or native table rows establish event facts.
Explicit requests for Discord, Miro, email or Drive use those sources. Gmail and
Drive search/read tools remain available.

Explicit chat requests can update source-backed map events through
`read_map_events`, `lookup_map_person` and `upsert_map_event`. Read the fixed
catalogues and current event first; preserve complete relationships and known
fields, merge partial edits and use the fresh optimistic version when updating.
Select only an existing activity type. Presence, personal plans, scheduled events
and participation retain their existing distinctions and approved timing rules.
Ordinary information requests do not request map changes.

`tools/map/chat.js` adds request-local evidence checks around the shared tools:

- Original messages, supported email body reads, actual Miro item/table content
  or source-scoped Calendar event reads must have occurred in this request.
- A source allowlist, URL, search heading or past chat transcript cannot provide
  evidence for a new mutation. Existing unchanged event/participant fields may
  be retained from the current snapshot.
- A changed participant requires a successful exact identity lookup backed by
  the same original participation source. Discord lookup uses the observed
  message author's provider ID; email lookup uses the observed sender address.
  A name, asserted identity or local-development principal is insufficient.
- Large snapshots are withheld as a whole at 64,000 bytes. Re-read with an event
  or source filter rather than replacing incomplete relationships. Removed
  participants cannot be silently omitted; preserve them and use explicit
  supported attendance/end changes.
- Stateless `/api/tools` requests may read map events but cannot supply trusted
  write or lookup receipts. The chat orchestration creates fresh request state.
- The shared service independently rechecks current source access and enforces
  valid complete snapshots, immutable catalogues and optimistic writes.

Only a ready result with an applied map receipt confirms a saved change. Denial,
conflict, unavailable service or missing receipt leaves the change unconfirmed.
If a user says “put me at Bobst” without a trusted identity and original supported
source, explain the missing evidence and ask for that source. Do not fabricate a
chat provenance record or reuse debug fixtures.

Chat can create, update and soft-cancel supported events in the configured club
Calendar for affirmative current-user requests. The request-local Calendar adapter
exposes only the relevant action tools after an affirmative user directive;
quoted/reported document instructions cannot request writes. Stateless tool calls remain read-only.
Before editing/cancelling, read the exact event in this request; its hidden revision
controls the conditional patch. Preserve untouched fields, original identities and
known duration when rescheduling. Recurring, attendee-bearing and special events
are unsupported. Miro writes, email sends and Discord posts remain unavailable.
A ready calendarWrite receipt with outcome, eventId and canonical URL is the only
success claim; failures/conflicts remain unconfirmed. User-directed writes are
separate from the update agent's managed Miro/Discord provenance and ownership path.
Creation IDs derive from a server-owned conversation hash and desired fields;
identical requests/arguments reconcile a lost reply rather than blindly inserting
again. This is not global deduplication across arbitrary future conversations.
Drive search/read is already wired to the authorized Google account, with original
links and bounded/first-sheet-only content warnings. The request
budget is eight executed tools and eight planning rounds for Calendar fallback,
Miro navigation and map workflows, with at most two calls per round. Ordinary
retrieval remains bounded to two rounds. The answer sees bounded structured
Calendar, Miro and map context plus successful action receipts; arbitrary adapter
fields are excluded.

Configured-model behavioral checks use synthetic source records and inert writes, alongside backend regressions. Actual acceptance and source/build hashes live in [verification receipts](../evidence/agent-prompts/live-model-results.json). Deployment, worker activation and real Calendar/map event mutation remain separate.
Calendar map provenance additionally requires an explicitly configured and
authorized `AGENT_CALENDAR_SOURCE_ID`; Calendar read access alone does not grant it.

Configured-model findings corrected missing Calendar-window arguments in model-visible results and added explicit progress guidance for completed empty/failed reads. Named-team requests override broad eboard defaults. Undated recent updates include the current local date through now; they do not silently stop at midnight or use the previous completed week. Requested map workflows receive dependent rounds from the initial source read. Configured Calendar originals bind map source_record_id to exact observed eventId; sender identities use a single actual mailbox rather than email-looking display text.

Personal map requests require the exact original source reference supplied in the
current request and its successful linked-author lookup. Finding a matching
Discord author does not identify the chat user. Negated map requests stay
read-only. A successful single-source write stops further planning, and renaming
a provider key cannot create the same Discord activity twice in one request.
Current presence must have an active timed window anchored to the explicit
original location report; the approved missing-end default is two hours. An
activity-only edit cannot refresh that expiry.

Live Discord scans are sequential. Both bot HTTP clients share per-process
pacing (750 ms minimum gap by default), Retry-After/JSON retry delays and
exhausted-bucket cooldowns. Each request is bounded at90seconds and each live or
aggregate scan at120seconds; a longer cooldown can still produce honest partial
coverage. Separate service processes do not share this in-memory queue. No
increase to channel/page/message or summary-model cost caps follows.

The overall chat deadline defaults to300seconds (ASSISTANT_REQUEST_TIMEOUT_MS,
maximum600seconds), separate from each model call's LLM_TIMEOUT_MS. This gives
paced reads and fallback time to return an answer. A complete nonempty Calendar
window ends an unsourced informational weekly question; contiguous pages must
belong to the same window, and explicit source/map/memory/action requests retain
their own workflows.
