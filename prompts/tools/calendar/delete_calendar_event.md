# delete calendar event

## description

<!-- prompt: description -->
Soft-cancel only the explicitly user-selected event after read_calendar_event in this request. Require one uniquely identified event: generic/partial matches, ranking, the first result and a successful read do not resolve multiple plausible targets. Ask which event before cancelling; other one is sufficient only when conversation identifies one distinct prior referent. This patches status=cancelled without permanent deletion and requests no guest notifications (sendUpdates=none). Recurring, attendee and special events are unsupported.
<!-- /prompt -->
