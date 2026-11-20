# Marketing helpers

Server code for the events-team and marketing workflow (ported from the
standalone marketing reminder bot in `port-source/`). It is kept separate from
chat, the update agent and the Discord ingestion collectors.

## calendar-events.js

A read-only list of confirmed upcoming events on the club Google Calendar
(`GOOGLE_CALENDAR_ID`). It reuses the existing club Calendar client in
`server/google/calendar-client.js`, so the Tech@NYU OAuth account, scope and
Calendar ACL checks stay in that client. Nothing here writes to Google or to
saved data.

- **Window:** from local midnight today in America/New_York up to (not
  including) local midnight 60 days later. Midnights are resolved through IANA
  rules, so DST days have their real length.
- **Excluded:** any event whose status is not `confirmed` (cancelled or
  tentative), gray events (`colorId` 8), and titles starting with `[TBD]` or
  `TENTATIVE` (case-insensitive, after trimming). Skipped counts are returned
  by reason.
- **Bounds:** reads go through the client's bounded `listEventsWindow`. When a
  window hits its size limits the range is split in half and re-read (at most
  64 windows); events spanning a split are deduplicated by ID.
- **Failures:** access/authorization failures withhold all content. Other
  failures after some events were read return `status: 'partial'` with
  `coverage.complete: false`; they are never presented as an empty calendar.

Run `npm run marketing:events` to print the list (see `scripts/info.md`).

## Discord slash commands (/event-info and /event-details)

These run inside the `discord-events` service, through the generic dispatcher
in `server/discord/interactions.js`. That dispatcher receives `INTERACTION_CREATE`
from the Gateway separately from chat (`MESSAGE_CREATE`) and from ingestion:
interactions never enter `agent_input_cache`, and a slow handler cannot hold back
the Gateway checkpoint. The feature is off unless `MARKETING_INTERACTIONS_ENABLED=true`.

- `config.js`: who may use the commands, read only from comma-separated
  environment variables. `MARKETING_ALLOWED_ROLE_IDS`: the member needs at
  least one of these roles. `MARKETING_ALLOWED_CHANNEL_IDS`: the command must
  run in one of these channels or in a thread directly inside one (Discord's
  channel object in the interaction must say it is a thread whose parent is an
  allowed channel). Unset or blank lists allow nobody; a malformed list stops
  the commands from starting (`interactions_unavailable`). Refusals name the
  allowed channels as Discord channel mentions. It uses only the roles and
  channel Discord includes in the interaction, with no extra Discord reads. The
  production values are in `deployment/discord-worker/info.md`.
- `event-info.js`: `/event-info`. Access is checked first; a refused user gets
  an immediate private explanation and nothing else runs. Otherwise it defers
  privately right away, reads Calendar, registers tokens for the first 25 events
  and edits the reply into a dropdown. It says when more than 25 exist or the
  Calendar read was partial. Picking an event re-checks access, updates the same
  private message and shows the saved details, or "no details submitted yet".
  Read-only apart from token registration.
- `event-details.js` and `details-form.js` (Stage 2): `/event-details`, with an
  optional `extras` switch. Access is checked on the command, the pick and the
  submission. The command defers privately and shows the same dropdown. Picking
  an event answers with the core form (title, date & time, location,
  description, food) or the extras form (assets, collab, tagging, notes),
  pre-filled with saved values (title falls back to the Calendar title). A
  modal must be the direct answer to the pick, so that prefill read cannot be
  deferred: it is limited to 2 seconds, and a slow or failed read gets a private
  "pick it again" reply instead of an empty form. A submission is deferred
  privately, then only that form's own fields are trimmed and checked against
  their lengths. Because the form always opens pre-filled, a blank optional
  answer (food or any extra) means the user deleted it and clears the saved
  value; required core fields cannot be blanked. This is only safe because a
  slow or failed prefill read never shows an empty form, so keep that rule.
  Each form may only change its own fields and has its own saved version. The
  form carries that version from when it was opened, and migration 058's
  `marketing_event_merge` refuses the save if someone else saved the same form
  since, so a stale form never overwrites or clears newer answers; a save of
  the other form never makes it stale. A refused save replies with the
  person's answers (each in a code block, so links copy exactly) to paste into
  the reopened form. The merge is atomic;
  the private confirmation shows the saved details, the fields actually
  cleared and anything still missing. Failed saves say nothing was saved; a
  timeout or lost response, where the write may have committed, says the save
  could not be confirmed instead.
  No channel summary card or reminders yet.
- `store.js`: fixed service-only RPCs from migrations 057 and 058 over Supabase REST.
- `views.js`: dropdown, details embed and messages. Mentions are always disabled.
- `commands.js` and `scripts/register-marketing-commands.mjs`: registers named
  commands one at a time with Discord's single-command endpoint, which creates
  or updates only that command. The bulk-replace endpoint is never used.
- `interactions.js`: wires the above together for `server/discord/event-cli.js`.
