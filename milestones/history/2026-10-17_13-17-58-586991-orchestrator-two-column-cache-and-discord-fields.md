# Two-column cache and Discord fields

- Local timestamp / acting role / milestone: 2026-10-17_13-17-58-586991; orchestrator; ongoing design discussion.
- Requested scope: cache table must have exactly uuid and raw response JSON; capture username, nickname, message, time/date and related context.
- Starting repository state: proposed temporary message buffer only; M29 live-only remains implemented. No pending app changes from this discussion.
- Work performed / changed files: verified official Discord Message and Gateway events references; updated rolling snapshot/to-do/history guide and appended this record.
- Decisions: exactly uuid UUID primary key and raw_response JSONB. Preserve event type and provider payload in JSON, not additional SQL columns. Subscribe to message create/update/delete; message fields include author/content/sent and edited timestamps, IDs, reply references and available member nickname. Names label a stable Discord user ID. Member nickname changes require member events and appropriate intent; arbitrary global-user rename subscriptions should not be assumed. Preserve native timestamps and render local date/time when needed. Partial events require selective merging or fetching missing context rather than overwriting known values with absence. Cleanup targets exact completed row UUIDs after durable work is recorded; no full-table truncation during live ingestion.
- Checks and evidence: official https://docs.discord.com/developers/resources/message and https://docs.discord.com/developers/events/gateway-events . Documentation-only whitespace check; no app tests or independent acceptance claimed.
- Resulting state / acceptance: design constraints recorded; no schema, bot subscription, credentials, calendar/map writes or deployment changed.
- Remaining work and handoff: implementation remains unrequested; source scope, bounded retention/recovery and durable plan/tool-action state need a concrete implementation brief if requested.
