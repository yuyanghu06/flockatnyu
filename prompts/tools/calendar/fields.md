# fields

## batchtimingproperties.date.description

<!-- prompt: batchtimingproperties.date.description -->
All-day date if alone; local timed date with startTime/endTime/timeZone. Never omit supplied clock times.
<!-- /prompt -->

## batchtimingproperties.starttime.description

<!-- prompt: batchtimingproperties.starttime.description -->
Local HH:MM; requires date, endTime and timeZone.
<!-- /prompt -->

## source.sourcekey.description

<!-- prompt: source.sourcekey.description -->
Exact authorized original source identity: discord:<guildId>:<channelId>:<messageId> or gmail:<messageId>. Preserve it across edits. Never use queue UUIDs, titles, dates or row positions.
<!-- /prompt -->

## source.sourceurl.description

<!-- prompt: source.sourceurl.description -->
Exact observed original source URL. Gmail uses https://mail.google.com/mail/u/0/#all/<messageId>; Discord uses https://discord.com/channels/<guildId>/<channelId>/<messageId>. Original evidence and current authorization are mandatory.
<!-- /prompt -->

## boundary.date.description

<!-- prompt: boundary.date.description -->
All-day YYYY-MM-DD; end date is exclusive.
<!-- /prompt -->

## boundary.datetime.description

<!-- prompt: boundary.datetime.description -->
Timed event RFC3339 timestamp with explicit offset, e.g. 2026-10-20T18:00:00-04:00.
<!-- /prompt -->

## boundary.timezone.description

<!-- prompt: boundary.timezone.description -->
IANA timezone required alongside dateTime, e.g. America/New_York.
<!-- /prompt -->

## chat-boundary.date

<!-- prompt: chat-boundary.date -->
All-day YYYY-MM-DD; end is exclusive.
<!-- /prompt -->

## chat-boundary.date-time

<!-- prompt: chat-boundary.date-time -->
RFC3339 with explicit offset.
<!-- /prompt -->

## chat-boundary.time-zone

<!-- prompt: chat-boundary.time-zone -->
IANA timezone required with dateTime.
<!-- /prompt -->
