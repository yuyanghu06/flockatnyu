# update calendar events

## description

<!-- prompt: description -->
Patch up to50 exact eventIds from prior receipts or a narrowed Calendar listing. Internally reads each exact ID for a fresh hidden revision then patches only supplied fields, preserving IDs/human fields; conflicts/unsupported rows fail independently. Use compact {eventId,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} to correct timed schedules without expanding arguments. Canonical start/end may convert all-day/timed; never omit known times. Title-only matches do not select an eventId. No attendees, recurrence, invitations or alternate calendar.
<!-- /prompt -->
