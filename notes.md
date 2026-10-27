# User notes and ideas

Persist user-requested notes here across sessions. Preserve the user’s intent, date meaningful additions, and distinguish an idea from approved implementation. When a note changes, mark it superseded with the replacement rather than silently erasing it. Current implementation and verification belong in milestones/milestone.md; service boundaries belong in docs/architecture.md.

## 2026-10-17

- **Structured agent records and prompting:** use strict JSON arrays in `map_buildings.people_here` and the existing event column `scheduled_events` (called events_here in conversation). Keep person/current-presence/future-plan/event/RSVP concepts separate, use known identities/buildings and faithful activity labels, preserve corrections/expiry/provenance, and never let prompt text imply an unavailable write tool or grant.
- **Approved two-hour defaults:** current explicit location reports without an end expire two hours after the original report timestamp; a newer explicit location confirmation refreshes that window. Timed events with a known start and no end/duration default to two hours. Explicit ends/durations override defaults; existing ends survive partial edits. All-day dates keep their exclusive local-calendar end, and missing event starts are not invented. These policies are wired into the update-agent prompt; agent tool implementation/activation remains separate.

- **Scheduled-event attendance:** a key purpose of scheduled events is knowing who plans to attend. Each event JSON payload should eventually include an array of attendee user UUIDs. Consider moving events into a dedicated table later if that makes attendance and event relationships easier to manage. Saved requirement/design direction only: defer both the attendee schema change and separate-table migration during the current UI iteration; keep debug fixtures on the existing standardized schema for now.

- **Event-type icons:** consider separate SVG icons for the different kinds of events the club runs, so scheduled-event rows can communicate event type visually. Saved idea only; event taxonomy, icon designs and implementation remain undecided.

- **Event-driven map population:** in the future, scheduled events should automatically populate attending users at the event's respective map location during its time window. Saved future requirement only; adding sample event attendees now does not update people_here or implement automatic map presence.

- **Why a separate events table:** attendee relationships and automatic event-to-location map population are the user's reasons for considering a dedicated events table. Preserve this rationale for the later data-model redesign; the separate-table migration remains deferred.

- **Scheduled building events:** the Scheduled view is for events occurring at that building and time, not a list of people who will be there. The agent should populate it from event sources such as Calendar, including the event's time and location. Keep current people/presence separate. This corrects the current people-plan interpretation of Scheduled; saved direction only, no event schema, agent write tool, Calendar activation or UI redesign is implemented by this note.

- **Standard text color:** use pure black (#000000) as the default interface text color, including thought bubbles, itinerary names/details/times, map controls and assistant copy.
- **Today-only map population:** future plans must stay in the person's upcoming list and must not create map avatars before their validity window begins. Use America/New_York dates; future-day plans are not current presence.

- **Building activity view:** selecting a building should let members see what is going on there, alongside the people associated with it. Saved product requirement; the activity view is not implemented by the avatar visual changes.

- **Fixed map locations:** runtime/agent location writes may modify only `map_buildings.people_here`. Building IDs, names, aliases and row creation/deletion stay fixed; `updated_at` is database-managed. No general building-edit tool.

- **Update agent cadence:** process when 30 eligible Discord/Gmail inputs accumulate, or the oldest waits 30 minutes; retain the 1-minute cooldown and 5-second queue checks. The age is measured from the oldest eligible pending input, not fixed clock times or the previous run. This supersedes the earlier 5-input/5-minute defaults. Discord message changes and emails share the threshold; Miro is a separate sync collector and has no automatic queue producer yet.

- **Agent names:** the frontend conversational assistant is the **chat agent**; the backend autonomous processor is the **update agent**. These names supersede frontend/backend agent terminology. The chat agent is served by the Chat API, and the update agent runs in the automation worker.

- **Calendar:** use Tech’s **fall26** calendar for the calendar integration. User supplied the exact Google Calendar ID on 2026-10-17; it is configured as GOOGLE_CALENDAR_ID in the ignored local environment. Calendar event writes and per-batch Miro reads/prompt wiring are authorized. Additional Calendar OAuth consent completed, but the owner must share the target with the app account hello@techatnyu.org using Make changes to events; API currently returns404. The user does not have permission to grant this access and explicitly deferred Calendar activation while moving to other subjects; wait for owner access or a user request to resume.
- **MVP first:** finish the initial MVP using the agreed architecture, then expand later.
- **Frontend:** substantial frontend changes are planned. Keep backend contracts and ownership clear so frontend work can proceed independently.
- **Shared agent tools:** The chat agent and update agent should share tool implementations. The target is the same tool catalog with different prompting; exact tool exposure and wiring are a later discussion.
- **Architecture:** keep one repository with independently deployable source collectors, the chat agent’s API and the update agent’s worker, sharing Supabase with explicit data ownership.

- **Table-driven map labels:** each people_here JSON entry stores a separate label string. Presence names/building names/labels display from table values only; no generated Test badge or caption based on source/status. Empty label hides the caption.
- **Activity-based labels:** when the map-write tool is wired, the agent should set `people_here[].label` to a short description of what the person is doing at that location, based on what they have shared (for example, “Studying” or “Working on a project”). Do not guess the activity from the building alone; leave the label blank when the activity is unknown. This is a saved behavior requirement, not a claim that the tool is implemented.

- **Attendance implementation correction (2026-10-17):** the later request to add Yuyang/Khidir as sample event attendees authorizes the small optional attendee_ids JSON extension and portrait display now, superseding the earlier attendee-array deferral only for this scope. Dedicated events table and automatic map population remain future work.

## 2026-10-18

- **Approved normalized events implementation:** implement events, event_buildings and event_people to replace map_buildings.people_here and scheduled_events after verified migration. This supersedes the earlier dedicated-table and event-driven-map deferrals and people_here-only mutation boundary for activity storage. Building/person catalogue edits remain unavailable to the agent. Keep names, faithful per-person labels, timestamps, provenance, current source checks and approved two-hour defaults.
- **Visibility across multiple locations:** no is_primary or per-person building assignment. An active eligible participant displays at every building linked to that event. The same person may appear at several buildings/events simultaneously; deduplicate avatars only within one building. Separate event records express different groups at different locations. Future records stay upcoming until active; this display does not verify physical presence.

- **All building activities and fixed types (2026-10-18):** show all authorized unexpired event kinds at a building, including personal plans/current activities; this supersedes the earlier club-event-only filter. Use exactly Study, Meeting, Event, Social and Other as predefined categories. Agent selects an existing type; catalogue editing remains unavailable. Exact later writable fields remain a later decision. First abstract geometric icon set rejected as unclear; use familiar book/people/calendar/speech-bubble/ellipsis symbols with the warm avatar/building treatment. Show bold weekday/date/time, then room/area separately without repeating the building name.

- **Event icons cancelled (2026-10-18):** the user rejected both generated sets as unclear and requested deleting the event logos altogether. Remove category icon rendering and new generated event-icon assets. Keep the five predefined data types and attendee portraits. This supersedes the earlier icon request/style suggestions, including the literal-symbol revision.

- **2026-10-18 — Automatic long-term club memory:** the model should proactively update the shared memory document whenever it finds club information in any chat that it judges useful to remember. Users do not need to ask it to remember or update memory. This is approved implementation behavior, not merely a future idea; explicit corrections/forget requests still apply.

- **Future Luma API (2026-10-18):** consider integrating Luma's API later. Saved idea only; focus current work on existing integrations.
- **Chat behavior (2026-10-18):** use a calm, friendly tone. Broad Discord updates read all authorized eboard channels first and summarize notable events/decisions; other general channels are secondary fallback. Individual team channels require an explicit user request; leadership-team and descendants are blacklisted for shared reads. Existing excluded categories remain excluded. Weekly schedule questions use the configured Google Calendar first; empty/unavailable Calendar results automatically trigger a Miro content cross-check for potentially unsynced events, distinguishing absence from failure. Gmail and other existing sources remain available.
- **Autonomous planner/update agent (2026-10-18):** planner in this discussion means the existing update agent, not chat's internal tool selector. Keep30eligible-input/oldest30minute trigger. Per run prioritize eboard Discord evidence for current activity, study/cowork plans and explicit attendance; reconcile supported Miro events into fixedGCal and actualGCal occurrences into timed map events. Preserve stable identities, source evidence and existing people/building catalogues. Chat may also update the map from supported user requests/evidence. Miro remains read-only; no reverse board writes requested. Prompt/tool implementation authorized; activation/deployment stays separate.

## 2026-10-18 — Event synchronization clarification

Calendar is the canonical scheduled club-event view. The planner should reconcile
clear authorized Discord event announcements/changes as well as live Miro plans
into that Calendar. The map mirrors scheduled Calendar events and separately
shows informal study/co-working/presence and personal plans; these do not all
belong on Calendar. Discord RSVPs enrich participation on the same event. Miro
remains read-only under the existing authorization; full bidirectional board
synchronization is not implemented or authorized by this preference. Preserve
human edits and defer conflicting/ambiguous matches rather than duplicating.

## 2026-10-18 — Prefer slower Discord checks to throttling

The user accepts longer bot scans and asked to slow Discord checks after seeing
rate-limited partial summaries. Model behavior tests use synthetic Discord data
but share the configured AI service; avoid unnecessary live-source checks and
pace test model requests too.

## 2026-10-18 — Live rollout and publication

After the optimization pass, deploy the live website and backend services on
Railway and enable the autonomous agent so updates begin. The frontend and chat
API share a web service; collectors and background agent remain separate. Add
a password gate with SITE_ACCESS_PASSWORD in private Railway environment
variables only. Split the current working tree into logical commits, then push.
This supersedes the earlier activation/deployment deferral for this rollout;
preserve all source permissions and avoid credentials in code/history/output.

## 2026-10-18 — Future personal memory and accounts

- Consider persistent per-user memory, such as the user's name and preferences, identified through Chrome/browser local storage or Google OAuth account creation. These are alternative approaches to explore; no account model has been selected. Saved future idea only, not authorization to implement accounts, OAuth consent, browser identity tracking or personal-memory storage during the current chat bug/attendance fix.

## 2026-10-19 — Canonical club Drive and future agent context

- The user identified https://drive.google.com/drive/folders/1-B4dcmsHYTpneVgxzuzVKB_QaO0R3SkQ (tech@nyu) as the club's monodrive for everything. School-account connector access is authorized for this structural research.
- Use the club's programs—Tech Treks, Dev Team, Mentorship, Buildathon and Startup Week—to understand and navigate that hierarchy. The requested direction is a complete file/folder navigation index supplied as context for Drive tool calls by chat and the autonomous planner/update agent. Prompt/runtime changes remain deferred under the user's earlier instruction; this research does not activate injection or change Drive files/sharing.
- Private metadata-only research inventory and program navigation are saved outside Git at ~/.local/share/flock-drive-research/2026-10-19/. Document bodies and credential values are excluded. Current labels can be stale; preserve explicit semester/year, archive/template distinctions, real parent IDs and tentative-source wording. School research visibility is separate from runtime source authorization.

## 2026-10-19 — Drive skill implementation authorized

The user approved a new Tech@NYU Drive access skill, automatically injected for chat and autonomous planner Drive tool calls. This supersedes the earlier prompt-change deferral for this bounded read-only integration. Private research inventory stays outside Git; use current runtime account permissions and live metadata.

## 2026-10-19 — Planner Google access authorization

The user authorized allowing planner Google reads and specified hello@techatnyu.org for Gmail because it can access the club Drive. This account is already configured across Google services. Restore the existing native Gmail source grant on the worker, covering its read-only Gmail/Drive tools, while preserving current source/write and collector boundaries. This supersedes the earlier separate pending source-policy decision.

## 2026-10-21 — Future map time selector

- Add a clock/time selector near the top of the map so members can choose a future date/time and preview the people, activities and events expected then. For example, a recorded eLab plan ending at 5pm should appear when viewing 4pm. Show recorded plans rather than claiming verified physical presence. Placement is tentative. Saved future feature only; do not implement it yet, and keep the current live map behavior until separately requested.

## 2026-10-21 — Go Greek temporary popup

The modeled 683 Broadway location should display as **Go Greek** and is a temporary popup for one specific day. Keep its model and associated UI/camera behavior easy to disable and remove together, and document the entire import/cleanup path. The exact day has not been supplied; no automatic scheduling or expiry is inferred.

## 2026-10-21 — Supabase MCP preference

Use Supabase MCP for database operations. The user objected to a silent computer-control fallback. Surface connection/authentication issues and use the configured MCP route; do not silently switch to dashboard writes. OAuth sign-in is separate from data operations.

## 2026-10-21 — Active event map signals

When an event is underway, show the yellow exclamation mark from the personal website and make its building glow. The user also requested a sample event at683Broadway/GoGreek to preview the appearance. Implement signals from authorized current scheduled events and retain clearly labeled, expiring sample provenance; do not fabricate a real provider announcement.

## 2026-10-21 — Relevant links during planner Discord summaries

- **Planner link following:** When the autonomous planner/update agent summarizes or reviews Discord originals, it should open links it judges relevant to understanding or acting on the activity—for example, a volunteer signup sheet. The presence of a relevant link is sufficient reason to inspect it through available authorized read tools rather than relying only on the message excerpt. Preserve normal source/account access and treat linked content as evidence. User requested this as a saved behavior requirement; implementation and verification are a separate follow-up.

## 2026-10-22 — Corrected future update-agent scope; do not implement yet

The user clarified that the intended update agent has only two responsibilities:

1. Read the temporary cache of authorized Discord/Gmail messages and make the corresponding Calendar changes.
2. Update people's map location/participation from what they actually say, associating them with the appropriate events when those events exist.

The user does not want broad rolling Calendar reconciliation, pagination upkeep or other general synchronization chores assigned to the model. Automatic per-batch Miro reconciliation is outside this newly stated two-task scope; this note does not disable Miro or its read tools. The separately ongoing cache/deterministic Calendar work is expected to handle mechanical synchronization and reduce these failures. Its existing implementation is not changed by this note, and exact personal-plan routing is not newly decided here.

This corrects the broader future planner responsibilities in the October 18 notes. Preserve those entries as history. The user explicitly requested recording this direction only and deferring implementation until they have time. Do not change prompts, code, tools, limits, services or deployment on the authority of this note. Earlier discussion of 24 calls and longer timeouts remains discussion, not selected settings.

## 2026-10-22 — Update-agent simplification resumed

The user explicitly resumed implementation of the corrected two-task scope after the separate Calendar work. This supersedes the earlier implementation deferral for this cleanup. Remove automatic worker Miro/general model synchronization duties; retain completed deterministic Calendar/cache work and existing personal-plan routing. No new call-limit or timeout values were selected.

## 2026-10-22 — Computer-use Flock testing permission

The user permits computer use to visit Tech@NYU Discord #flock-test and send routine test messages to Flock when useful for requested verification. Save this standing permission in AGENTS.md. The user explicitly clarified that no live test is needed now; permission was recorded without sending messages.

## 2026-10-22 — Runner tool errors and call-cap audit

The user authorized changing failed tool results, thrown errors, null/malformed results and oversized results into a generic tool-call error with a safe reason returned to the model, which can continue other work. This resumes implementation for that specific behavior after the prior no-code discussion. Existing source tools retain their own checks; no compound cache/source-validation tool or new call-limit value is requested. The user also explicitly requested a separate agent to count model replies requesting more than8calls, distinguishing this from cumulative calls across an entire run.

## 2026-10-22 — Plain task-cache reads, standard tools afterward

The user authorized splitting the bundled cache reader into a plain read of saved task data. The model then decides which standard Discord/Gmail, Calendar and map tools to call for the task. Do not hide source rereads, Calendar preflights or reference checks inside task-cache reads or catalogue preparation. Keep normal tools responsible for their own checks, rather than adding another compound tool. No new cap or timeout settings were selected.

## 2026-10-22 — Test realistic behavior and permit API evaluations

The user prefers meaningful use cases, edge cases, correct responses and actual task outcomes over large test totals. Leave syntax and other compiler/build-detectable errors to the normal checks; avoid redundant tests that merely repeat implementation details. Evaluators may use configured model/application APIs for bounded realistic simulations and inspect actual responses. Distinguish scripted checks from real model behavior and live verified outcomes. This request records the policy; it does not itself run API calls or remove tests.

## 2026-10-22 — Worker call limits selected

The user explicitly selected16tool calls per model reply and64total calls per stage for the update/planner worker and requested notification once deployed. This supersedes earlier notes that no new call limits were selected. Initial and followup stages each get64; chat limits, model rounds and timeout/token settings remain unchanged.

## 2026-10-22 — Attendance route correction and full prompt audit

The screenshot of a first-person GoGreek attendance request exposed an old named-attendance parser/tool route still registered and prompted. Correct it using the previously authorized normal map tools and verified Discord actor/name, preserving actual write/access checks. After this fix, the user explicitly requested an audit of all application prompts and updates to outdated instructions, including tool instructions and both chat/update-agent paths.

## 2026-10-22 — Cancellation task completion authorized

After the prompt audit exposed a missing cancellation case in saved-task completion, the user explicitly requested adding it. Confirm exact successful club/Member Plans cancellations before removing their saved tasks, while retaining failed or uncertain work. This is a backend completion fix, not a new prompt/cache tool or budget change.

## 2026-10-22 — OpenCode inference API as a cheaper model provider (idea only)

The user is considering replacing the OpenAI API calls with OpenCode's Console
inference API to cut model costs. Recorded findings as of this date:

- **Feasibility**: feasible without architecture change. Console serves OpenAI
  Chat Completions and Anthropic Messages wire formats at
  `https://opencode.ai/inference/{openai,anthropic}/...`, which the single
  `server/providers/index.js` core already speaks. It is a stateless inference
  endpoint, not a headless agent harness; no `opencode serve` instance is
  involved. GPT models are served only via the OpenAI **Responses API**, which
  the adapter does not implement, so GPT-through-Console needs adapter work.
- **Billing**: free for any team size, no seat fees; pay-as-you-go prepaid
  credits with a 4.6% + $0.31 processing fee per purchase; optional monthly
  invoiced billing; budgets exist; paid requests fail with HTTP 402 at zero
  balance, which is outside the adapter's retryable status set.
- **Indicative prices** (USD per 1M tokens, input/output, current docs):
  GLM 5.3 Flash $0.15/$0.50; Qwen3.8 Flash $0.15/$0.47; DeepSeek V4.1 Flash
  $0.30/$1.20; MiniMax M3 $0.30/$1.20; Kimi K2.6 $0.95/$4.00; Claude Haiku 5.5
  $0.10/$0.50 (≤100K ctx); Claude Sonnet 5.5 $2/$10; Sonnet 4.6 $3/$15; Claude
  Opus 5.5 $4/$20; GPT 6 Luna $0.10/$0.50 and GPT 6 Sol $2/$10 via Responses.
  Cached read/write columns map onto the existing audit cache partitions.
- **Savings source**: model choice, not gateway arbitrage for identical models
  (Console sells at cost plus payment fees). Free promo models are time-limited
  and some collect usage data during the free period, so no live worker path
  should depend on one.
- **Status**: discussion and documentation only. No key, server config, code,
  call-limit, timeout, prompt, schema, service or deployment change is
  authorized by this note. Any cutover requires the bounded sequence: Console
  key in Railway env → recorded response fixture → compatibility regressions →
  real-model eval on simulated storage → separate deployment decision.


## 2026-10-22 — Reuse existing events for attendance

Approved correction: when a member says they will be at a named event/venue on a date, inspect existing authorized map/Calendar occurrences before asking hours or creating a separate activity. “The entire time” inherits the matching event’s existing interval, not all day. Preserve explicit independent plans and clarify ambiguity. The user authorized removing the erroneous all-day GoGreek duplicate while retaining attendance on the original3–5PM event.

## 2026-10-25 — Bug: cancelled Calendar event replaced by a new event may not appear correctly on the map

The user reported that cancelling one Calendar event and creating a replacement may leave the map activity, building link or attendance attached to the wrong event. In the HP incident, the original remained cancelled and its saved attendees were hidden; the active replacement had a separate map entry but no building link. The individual records were corrected manually. General cancellation/replacement reconciliation remains an **open bug**, not a completed fix. Track cases with changed event IDs, missing replacement location, existing attendance and ambiguous replacements; preserve distinct events and avoid reviving cancelled originals. Hosted bug report: `5ad778a5-c122-4f67-9ff4-347a8cb6f210`.

## 2026-10-26 — Treg call logging

- User requested logging the entire Treg people-search call, including request, provider response and import result. Use private server-only retention with credentials removed; this does not broaden unrelated source/model logging. The six displayed contact fields are our importer projection, and id/timestamps are database-managed; Treg provider fields can differ or be missing. Implementation/live status belongs in the milestone.

- **Treg raw lead preservation correction:** user wants each complete raw provider lead saved to contacts.raw_input and only supported values rendered. Extra/native fields and unknown formats must survive; identity matching may normalize transiently but must not reshape the saved record. This supersedes the initial normalized-six-fields-plus-nested-provenance storage arrangement for new imports. Existing leads and human edits stay untouched.

## 2026-10-26 — Separate cached-sender enrichment

- User requested a new separate service: read the newly built Gmail sender cache, enrich cached people using Treg, save the full enrichment back into that same cache, then store raw enriched contacts in Contacts. This authorizes the separate enrichment pipeline, not direct collector-to-Contacts writes or Gmail body transmission. Actual intake049 is sender-only. Preserve original email/name keys and human edits, use saved responses on restart, and keep billing/logging bounded and private. Implementation/activation truth is in the milestone.

## 2026-10-26 — Raw-only cache correction

- User explicitly rejected saving the full Treg enrichment back into contacts_cache. That table is raw, unenriched input only. The separate service reads it and writes native enriched contacts only to Contacts, leaving cache inputs unchanged. This supersedes the earlier cache-backwrite sequence and cached-response resume design. Keep necessary processing metadata outside the cache; private full-call logging remains authorized.

## 2026-10-26 — Daily enrichment schedule

- User requested the separate Railway enrichment service at 9 AM ET and explicitly confirmed New York local time including daylight saving. Use a finite scheduled backlog drain rather than a permanent polling process. Railway UTC cron checks 13:00/14:00; only the New York 09 hour may construct the runtime. Other checks exit without database/provider work. Raw cache remains unchanged, only pending jobs process, and spending/failure limits remain visible. User authorized scheduling/deployment; readiness and actual private token status are in the milestone.

## 2026-10-26 — Dormant lookup routes and no fallback

- User requested backend routes for email finding, email verification, phone finding and company enrichment, without exposing them to tools or other callers yet. Keep exported handlers unregistered in the running app until a later integration request.
- User explicitly confirmed keeping current person/email enrichment without provider fallback. Do not turn on a provider waterfall or silently retry other providers. Implementation and verification remain in the milestone.

## 2026-10-27 — Daily Treg provider update scope

User superseded the earlier no-fallback preference only for the daily Gmail enrichment service: Apollo first if available, two providers total with AIArk second. Keep9AMNewYork/DSTschedule and existingbudget/cache/nativeContacts boundaries. User explicitly cancelled the proposedCSVrerun and narrowed this change to the daily runtime; do not change/release websiteTregtools or runCSVagain. Actualimplementation/release truth belongs in the milestone.

## 2026-10-27 — Daily Tomba first

After the provider comparison, user selected Tomba as default and explicitly clarified dailyserviceONLY. Use Tomba first with Apollo fallback, maximumtwo providers total, preserving existing9AMNewYork/DSTschedule, spending and raw-data boundaries. This supersedes today's earlier dailyApollo→AIArkorder only. No website/tool changes or CSV/benchmark rerun are authorized by this preference. Actualrelease truth is in the milestone.

## 2026-10-27 — Enrichment batches capped at50

User requested a hardmaximum50cacheemailsperbatch to avoidoverwhelming enrichment. Keepprocessingoneemailatatime andbriefpausesbetweenbatches; morebatchesmaydraininthenormaldaily run. PreserveTomba→Apollo/max2 and existingmoney/schedule/data boundaries. Thisdoesnotrequestlivecachetestdata orrerunCSV. Actualimplementation/release state is in the milestone.

## 2026-10-27 — Treg discovery saves people by default

User wants company-people discovery through search_treg_people and richer profiles through enrich_treg_people, then successful results saved in Contacts by default using separate database tools. Clarified people at companies, not company enrichment. Explicit no-save requests still take precedence; preserve complete native raw objects and existing human edits. CRUD tools already exist. Implementation and release truth belongs in the milestone.

## 2026-10-26 — Selected planner remedies

The user approved trimming unused active-conversation logs, an accepted separate no-change result for saved tasks, improved source/ID/Calendar-target prompting and formatting, and successful terminal handling of confirmed missing originals with exact queue/task cleanup. Keep source permissions, exact versions and unfinished unrelated work. Reproduce and explain invented page IDs without fixing that behavior. Explain the old-log cleanup correction but hold its implementation. Other unselected fixes and limit/deployment changes remain out of this pass; actual status is in the milestone.


## 2026-10-27 — Side conversation: tools, services and API handoff

The user asked how tools relate to services and API routes, and whether it would
be cleaner to require every tool to be exposed through an HTTP API. They then
asked to save this discussion so another agent can take over later.

Current architecture, as explained in the conversation:

```text
Agent → tool → shared service → provider API or database
Website → HTTP API route → shared service → provider API or database
```

Tools and website API routes are separate entry points to shared services; tools
generally do not call the website's HTTP routes. Services hold shared validation,
permissions and operation logic, while some tool adapters also perform meaningful
checks or processing. This is a simplified explanation, not a claim that every
operation has both a tool and an HTTP route or that every tool is a thin wrapper.

Open question for the next agent: compare keeping these two entry points with
making agents call authenticated HTTP endpoints for all tool operations. Explain
which is cleaner for this repository, especially whether agents run inside the
same server or as separate processes/services, and what each choice adds in
network requests, authentication, shared checks and maintenance. The comparison
was interrupted before a recommendation was delivered. The user confirmed their
understanding that the current arrangement is a chain; they have not selected or
authorized an architecture migration in this side conversation.

This entry records discussion only. It does not establish a new implementation,
verification, deployment or release result. Continue from the current repository
state and preserve work happening in the main conversation.

## 2026-10-27 — Tools through APIs implementation authorized

The user resumed the earlier tools/services/API discussion and explicitly asked to
implement tools → APIs → service → provider. This supersedes the earlier note's
no-implementation status for this migration. The chosen API runs privately inside
each process; it is not a new public service. Tests remain stopped by the user's
earlier instruction. Current implementation, review and release status belongs in
`milestones/milestone.md`.
