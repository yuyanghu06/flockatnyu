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
