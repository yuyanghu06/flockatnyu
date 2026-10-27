# create calendar events

## description

<!-- prompt: description -->
Create up to50 requested timed OR all-day events. Never discard known times or put them only in descriptions. Use compact {title,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} for same-day timed rows; alternatively title+start/end RFC3339 boundaries. Date alone means truly all-day, with server exclusive next-day end. Do not mix date with canonical start/end. This tool only creates the supplied rows; it does not list Calendar or match existing events. Use a separate list_calendar_events call to inspect potential duplicates and decide which rows to submit. Update an existing event by exact ID instead of submitting a replacement create. Skip unresolved source rows and report after clear rows. No attendees, recurrence or alternate calendar.
<!-- /prompt -->
