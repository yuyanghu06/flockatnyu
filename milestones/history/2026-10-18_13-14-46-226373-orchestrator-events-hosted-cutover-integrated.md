# Dedicated events: events-hosted-cutover-integrated

- Local timestamp / acting role / milestone: 2026-10-18T13:14:46.226373-04:00 / orchestrator / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

Completed normalized event relationships and hosted cutover. Migration026 (20261018170616) and027 (20261018171006) are applied to the exact Tech NYU project. All5legacy presence/plan records and4scheduled events are preserved as9events/9building links/11participant links. Two-way semantic comparisons had0missing/0extra before old people_here/scheduled_events columns and obsolete RPCs were removed. Original catalogue fields/timestamps and26profiles are preserved. Hosted FORCE RLS/browser denial/RPC-only activity writes and immutable catalogue grants verified. A real service-role event+relationships write succeeded in a rolled-back transaction, leaving0probe records.

Shared event/identity/upsert tools and actual worker prompt/adapter use the normalized service. All eligible participants display at all event buildings, simultaneous locations are allowed, and markers deduplicate per person/building. Future/same-building schedules, all-day source timezone dates, attendee portraits, original labels/windows/source access, deterministic new-record two-hour defaults and optimistic corrections verified. New source-access callback is wired into API; exact fixture scopes remain local-only.

Independent checks:57/57map-event tests,138/138automation tests,12/12realSQL→Hono/Vite→Chrome synthetic browser checks; evaluator58/58focused checks and final ACCEPT. Both builds and final whitespace checks pass; existing chunk-size advisory remains. Fresh production-build live Chrome read9buildings/4active markers/1unexpired event/1upcoming relationship at verification time, Bobst1row/2attendee portraits and0page errors; screenshot private. Normal5173/API3001preview restarted and statusok after cutover; extra owned verification servers stopped.

Current guides,AGENTSoverride,notes,tests/package scripts and debug fixture utility updated. Evidence: evidence/events-relationships/hosted-verification.json,test-report.md,browser-report.json plus five synthetic screenshots. Private backup/source/profile/screenshots remain untracked under /tmp. No credentials printed, no model calls, source sends/edits, Railway deployment, commit or push. Concurrent assistant/map UI edits preserved.

Implementation milestone accepted complete. Separate follow-ups: disabled update-agent deployment/enablement and real-model pilot, pending Calendar owner sharing/preflight/Gmail configuration, chat tool registration, and scalable paged event reads before explicit snapshot bounds. Legacy reported_at is a documented start-time proxy rather than recovered provider chronology; no blanket monotonic source-time guard was invented.

