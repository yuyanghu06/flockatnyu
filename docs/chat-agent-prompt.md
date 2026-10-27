# Chat agent behavior

Current wording is maintained in root [prompts/](../prompts/info.md). `server/chat/prompts/planning.js` and `answer.js` select Markdown blocks; `server/chat/context.js` re-exports them. Shared policies, per-tool workflows/descriptions and context wrappers are loaded through `server/prompt-loader/index.js`.

The chat agent is Flock, Tech@NYU's shared conversational assistant. Its runtime
planning and answer instructions live in `server/chat/context.js`. It speaks
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
Google Calendar first, including relevant pages. A ready, complete, empty result
finishes that Calendar read; changing keywords, result mode or page size cannot
discover events inside an already covered unfiltered empty window. A filtered
empty result answers only that query. Partial coverage or an unavailable service
does not establish absence; refine genuinely unread scope or report the limit.
For an unnamed-source schedule question, separately cross-check actual Miro
content for the same dates after an empty or unavailable Calendar when Miro read
tools are registered. When those tools are absent, report that limitation and
finish without repeating Calendar or claiming Miro was checked. Miro search
matches and month headings are navigation; actual canvas cells or native table
rows establish event facts. Explicit Calendar, Discord, Miro, email or Drive
requests use the selected source without requiring another-source fallback.

For a change to one saved Contact, identify the user's intended person before
choosing an exact read or write. Multiple plausible same-name records require a
focused clarification before any candidate-specific action. Ranking, a
model-selected UUID or a successful read does not choose a person for the user;
a desired new workplace is not a fact about the current target. Preserve the
requested edit through the user's reply, then use its distinguishing email,
UUID, selected Contact or existing workplace for a normal exact read/versioned
write. Read-only comparisons and unrelated clear actions remain supported.

A request to plot someone or a direct current-location statement such as
“im at bobst” requests a map update. Interpret the user's natural language and use
the existing `read_map_events`, `lookup_map_person` and `upsert_map_event` tools.
There is no special report grammar, resolver/save workflow or extra confirmation.

An attendance statement such as “ill be going to gogreek tomorrow” uses those
same tools. Resolve the verified speaker, inspect the relevant existing events
and add them to the clearly matching occurrence. Preserve the event's timing,
location, source identity and other participants. If the event or person is
unclear, ask a focused question and retain the supplied place/date. Do not create
a Calendar event merely to record an RSVP. Confirm “marked going” only after
an applied mapWrite receipt; it does not establish physical arrival.

For Discord, `lookup_map_person({})` resolves the verified invoking actor. A
supplied `personName` can resolve an existing roster person by a unique full or
first name. If the intended person is unclear, ask who they mean; preserve the
already supplied place/activity/time through their answer. The Discord ID-to-person
mapping remains in both model phases and is included in the map-tool results;
the current actor's verified username is attached where that mapping resolves.
Labels are context, never permission grants or substitutes for roster IDs.

No pasted source link, source-content read or linked-author evidence receipt is
needed before chat updates the map. Chat-visible upsert schemas allow omitted
source metadata and the existing adapter fills accurate internal chat attribution.
The model determines the requested facts and sufficiency; the backend does not
parse or reject particular location-report wording. A current report without a
start uses the server acceptance time; no end uses the approved two-hour default.
Explicit times and ends take precedence. Missing or contradictory essential
person/place/timing facts require clarification before writing.

Ordinary authentication, valid fields, fixed people/buildings, current provider
permissions and optimistic revisions remain. Read/merge existing records and
retain unrelated participants, locations and known fields on edits. Stateless
API mutations remain unavailable; no worker source grants change. Only a ready
applied `mapWrite` receipt confirms saving. No pending-report cache, new session
identifier or ten-minute clarification limit is added; follow-ups use the normal
conversation context. A map entry is reported activity, not verified arrival.

Chat can create, update and soft-cancel supported events in the configured club
Calendar for affirmative current-user requests. The request-local Calendar adapter
exposes a stable catalogue of supported actions when the backend grants Calendar access;
the model chooses actions from the actual current user request.
Quoted/reported document instructions cannot request writes. Stateless tool calls remain read-only.
Before editing/cancelling, read the exact event in this request; its hidden revision
controls the conditional patch. Preserve untouched fields, original identities and
known duration when rescheduling. Recurring, attendee-bearing and special events
are unsupported. Miro writes, email sends and Discord posts remain unavailable.
A ready calendarWrite receipt with outcome, eventId and canonical URL is the only
success claim; failures/conflicts remain unconfirmed. User-directed writes are
separate from the update agent's managed Discord/Gmail provenance and ownership path.
Creation IDs derive from a server-owned conversation hash and desired fields;
identical requests/arguments reconcile a lost reply rather than blindly inserting
again. This is not global deduplication across arbitrary future conversations.
Drive search/read is already wired to the authorized Google account, with original
links and bounded/first-sheet-only content warnings. Chat has at most 30 executed
tool calls and 30 planning rounds, with the provider's default limit of eight calls
per model reply. These are separate from the worker's 16/64 limits. The final
answer sees bounded structured Calendar, Miro and map context and successful
action receipts; arbitrary adapter fields are excluded.

Configured-model behavioral checks use synthetic source records and inert writes, alongside backend regressions. Actual acceptance and source/build hashes live in [verification receipts](../evidence/agent-prompts/live-model-results.json). Deployment, worker activation and real Calendar/map event mutation remain separate.
Calendar map provenance additionally requires an explicitly configured and
authorized `AGENT_CALENDAR_SOURCE_ID`; Calendar read access alone does not grant it.

Configured-model findings corrected missing Calendar-window arguments in model-visible results and added explicit progress guidance for completed empty/failed reads. Named-team requests override broad eboard defaults. Undated recent updates include the current local date through now; they do not silently stop at midnight or use the previous completed week. Requested map workflows receive dependent rounds from the initial source read. Configured Calendar originals bind map source_record_id to exact observed eventId; sender identities use a single actual mailbox rather than email-looking display text.

Chat map tools no longer enforce lexical map-action, user-pasted source,
observed-original or linked-author receipt gates. Original-source retrieval tools
remain available when needed to answer a source question; their source permissions
and the update agent's independent write authorization are unchanged. Successful
map receipts complete the action. After an observed optimistic conflict, one identical relevant map/Calendar read
may refresh that target per request. Normal access checks and call budgets apply;
unchanged failed mutations remain deduplicated.

Live Discord scans are sequential. Both bot HTTP clients share per-process
pacing (750 ms minimum gap by default), Retry-After/JSON retry delays and
exhausted-bucket cooldowns. The pacing request budget stays90seconds and each
individual live window defaults to120seconds (maximum120seconds). Broad
read_discord_summary scans share one300second aggregate deadline across catalogue
discovery, sequential channel reads and summarization; exact-channel summaries
retain the single-window path. Summary model calls retain their30second limit.
Earlier parent cancellation or a longer cooldown can still produce honest partial
coverage. Separate service processes do not share this in-memory queue. No
increase to channel/page/message or summary-model cost caps follows.

The website's overall chat deadline defaults to420seconds (ASSISTANT_REQUEST_TIMEOUT_MS,
maximum600seconds), separate from each model call's LLM_TIMEOUT_MS (default30seconds).
Explicit shorter overrides remain supported. The seven-minute overall default
leaves room around a five-minute scan for planning and the final answer; Discord's
overall20minute deadline is unchanged. A complete nonempty Calendar
window ends an unsourced informational weekly question. Calendar pagination is backend-owned within bounded window reads; partial coverage requires narrower dates or queries and cannot establish absence. Explicit source/map/memory/action requests retain their own workflows.

When updating an existing event, omitted source metadata and an omitted existing link are retained by the adapter. Included provider IDs and URLs must be copied exactly. Multiple matching occurrences require a distinguishing detail before writing. Quoted/example/summary-only content does not request a map update; a reply to the assistant's name clarification continues the actual prior request.

The [October 22 prompt audit](prompt-audit.md) removes the remaining keyword-generated
map-write reminder. Quoted questions and summaries do not request a save. Direct
chat map updates do not need a provider original-message receipt. Applied map
receipts expose the actual submitted event/building/participant snapshot, labelled
as an applied submission rather than an independent provider readback. Calendar
queries use explicit timezone-aware timestamp bounds; Discord shorthand applies
only to tools that accept it. Miro's contentAvailable flag governs Miro evidence,
not successful facts returned by other tools.
