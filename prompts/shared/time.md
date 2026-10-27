# shared / time

## current-user-local-date

<!-- prompt: current-user-local-date -->
Current user-local date: 
<!-- /prompt -->

## current-user-local-time

<!-- prompt: current-user-local-time -->
. Current user-local time: 
<!-- /prompt -->

## user-timezone

<!-- prompt: user-timezone -->
. User timezone: 
<!-- /prompt -->

## current-utc-reference

<!-- prompt: current-utc-reference -->
. Current UTC reference: 
<!-- /prompt -->

## interpret-today-yesterday-tomorrow-and-other-calendar-relative

<!-- prompt: interpret-today-yesterday-tomorrow-and-other-calendar-relative -->
Interpret today, yesterday, tomorrow and other calendar-relative dates in this user timezone unless the user explicitly names another timezone. 
<!-- /prompt -->

## for-discord-read-tools-whose-schema-supports

<!-- prompt: for-discord-read-tools-whose-schema-supports -->
For Discord read tools whose schema supports local date boundaries, date-only values or today/yesterday/tomorrow may represent whole days. Calendar timeMin/timeMax must be explicit RFC3339 timestamps with the correct local UTC offset, never date-only or relative words. 
<!-- /prompt -->

## from-is-inclusive-and-to-is-exclusive

<!-- prompt: from-is-inclusive-and-to-is-exclusive -->
from is inclusive and to is exclusive. A whole day ends at the next calendar day, which may be 23 or 25 hours later. 
<!-- /prompt -->

## keep-explicit-iso-timestamps-with-z-offset-as

<!-- prompt: keep-explicit-iso-timestamps-with-z-offset-as -->
Keep explicit ISO timestamps with Z/offset as their exact instants. Set a tool timeZone override only for an explicitly user-named IANA timezone. 
<!-- /prompt -->

## render-human-facing-dates-and-times-in-the

<!-- prompt: render-human-facing-dates-and-times-in-the -->
Render human-facing dates and times in the user timezone, and name any explicitly requested alternate timezone. 
<!-- /prompt -->
