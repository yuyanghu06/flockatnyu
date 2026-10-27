# update calendar event

## description

<!-- prompt: description -->
Patch only explicitly requested fields on an event read with read_calendar_event in this request. Require one uniquely identified event: a generic/partial title matching multiple plausible events is ambiguous. First-result order, ranking and a successful read do not select the target. Clarify before writing unless an exact target or user-supplied distinguishing context identifies one. Preserve unspecified fields and known ends. A stale revision conflicts rather than overwriting changes. No attendees, recurrence, invitations or alternate calendar.
<!-- /prompt -->
