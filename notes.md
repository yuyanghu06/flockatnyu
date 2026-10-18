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
