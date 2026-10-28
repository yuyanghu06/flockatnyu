# descriptions

## endpoint

<!-- prompt: endpoint -->
Exactly {date} for all-day; new/changed timed endpoint uses {localDateTime,timeZone}, local clock WITHOUT Z/offset. {dateTime,timeZone} is allowed only as the exact corresponding endpoint copied from a current read of the same source-owned Member Plan.
<!-- /prompt -->

## endpoint.local-date-time

<!-- prompt: endpoint.local-date-time -->
Local YYYY-MM-DDTHH:mm:ss with optional .sss; NO Z or offset.
<!-- /prompt -->

## endpoint.unchanged

<!-- prompt: endpoint.unchanged -->
Exact unchanged corresponding raw endpoint from read_member_plan only.
<!-- /prompt -->

## source-key

<!-- prompt: source-key -->
Server derives the exact original source key from sourceUrl; omit when uncertain.
<!-- /prompt -->

## source-url

<!-- prompt: source-url -->
Exact original Discord/Gmail URL already read in this cycle.
<!-- /prompt -->

## source-id

<!-- prompt: source-id -->
Original message source UUID, never Member Plans calendar UUID. Server derives it from the exact URL and successful identity receipt; omit.
<!-- /prompt -->

## person-id

<!-- prompt: person-id -->
Exact person UUID returned by lookup_map_person for this original speaker/source.
<!-- /prompt -->

## list

<!-- prompt: list -->
Read the separately pinned Member Plans calendar. Use actual returned event IDs; no arbitrary calendar target.
<!-- /prompt -->

## read

<!-- prompt: read -->
Read one exact Member Plans event by returned ID.
<!-- /prompt -->

## upsert

<!-- prompt: upsert -->
Create/update an explicit personal plan or current presence on Member Plans. This operation writes only the pinned Member Plans Calendar; any needed original/identity reads are separate prompt-selected calls. personId must match that receipt. Server binds source UUID/key from exact original URL and lookup; omit sourceId/sourceKey. Presence defaults original report time through two hours later; personal plans need supported start/end. New/changed timed endpoints MUST use localDateTime (local clock without offset) plus IANA timeZone; raw dateTime is only an exact unchanged corresponding endpoint from read_member_plan for this same source-owned plan. No map-only events, invitations or attendees.
<!-- /prompt -->

## cancel

<!-- prompt: cancel -->
Cancel only the same source-owned Member Plans activity with explicit current original cancellation evidence; never cancel from absence or an RSVP decline. Server binds sourceId/sourceKey from original URL and successful identity receipt.
<!-- /prompt -->

