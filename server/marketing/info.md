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
