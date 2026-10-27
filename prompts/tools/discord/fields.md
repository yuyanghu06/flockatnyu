# fields

## date-boundary

<!-- prompt: date-boundary -->
Inclusive from or exclusive to boundary: ISO timestamp with Z/offset preserves its instant; YYYY-MM-DD or exact today/yesterday/tomorrow means start of that calendar day in the request timezone.
<!-- /prompt -->

## time-zone

<!-- prompt: time-zone -->
Optional IANA timezone override only when the user explicitly names a timezone. Otherwise use the request timezone.
<!-- /prompt -->

## scope

<!-- prompt: scope -->
Default eboard. general excludes team channels. team/all require an explicit user request before reading individual team content; leadership is always excluded.
<!-- /prompt -->
