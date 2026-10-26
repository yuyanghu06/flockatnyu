# Calendar cancellation and replacement bug recorded

- Local timestamp / acting role / milestone: 2026-10-25T13:57:37.545133-04:00 / orchestrator / bug-reports follow-up.
- Requested scope: note as a bug that cancelling one Calendar event and creating a new one may not synchronize correctly with the map.
- Starting repository state: existing unrelated runtime, schema, documentation and receipt changes from concurrent work preserved.
- Work performed / changed files: called the existing createBugReportTools/createBugReportStore path once with the exact current user message, bounded summary/observed/expected behavior and reproduction steps; saved an open hosted bug report. Added persistent notes and open backlog item; refreshed snapshot and affected journal guides.
- Decisions: distinguish the manually corrected HP incident from the unresolved general bug. The replacement did have a map record, so do not claim it was never imported; missing building and attendance remaining on the cancelled original explain the incident. Follow-up must preserve distinct events and avoid resurrecting cancelled originals.
- Checks and evidence: hosted receipt ready/created, reportId5ad778a5-c122-4f67-9ff4-347a8cb6f210, createdAt2026-10-25T17:56:55.383005Z. One report attempt; no inference. Private request/receipt remains ignored under evidence/calendar-replacement-bug-2026-10-25. Normal bug-report schema/context/service checks retained; credentials private. git diff --check run after documentation edits.
- Resulting state / acceptance: requested bug recorded in hosted tracker, notes and backlog; general issue remains open. No application change, Calendar/map mutation, migration, configuration change, deployment, commit or push by this pass.
- Remaining work and handoff: investigate and implement cancellation/replacement reconciliation when requested; no automatic merge policy or runtime fix introduced by this note.
