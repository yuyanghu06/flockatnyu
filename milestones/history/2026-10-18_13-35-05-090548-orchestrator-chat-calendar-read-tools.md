# Chat Calendar read tools

- Local timestamp / acting role: 2026-10-18T13:35:05.090548-04:00 / orchestrator (bounded side-conversation implementation).
- Requested scope: expose Calendar reads to chat; user corrected prior sharing blocker as resolved.
- Starting state: Calendar tools registered only for update agent; concurrent Miro/event/UI implementation preserved.
- Work performed: Chat now exposes list_calendar_events and read_calendar_event through its existing Google adapter. A dedicated read-only wrapper requires trusted googleAccess and pins the target to GOOGLE_CALENDAR_ID; Calendar writes remain unavailable to chat. Full bounded event fields, original links and nextPageToken survive chat serialization. User confirms Calendar sharing is resolved; live read access is now verified (writer access was not probed in this pass).
- Changed implementation: tools/calendar/chat.js, server/index.js, server/assistant-context.js, tests/chat-calendar.test.mjs. Affected guides and journal updated.
- Checks and evidence: 23/23 targeted chat/Calendar/assistant tests pass, API syntax/dependency build passes, focused whitespace check passes. Live adapter read: ready, one event and next page. Running API /api/tools lists both read tools; actual POST /api/tools/list_calendar_events returns HTTP200/ready, one event, next page and citation. No model call, Calendar mutation, server restart, deployment or subprocess interruption. Checks were performed directly in this side conversation, without independent agents; concurrent main-thread changes were preserved.
- Resulting state: requested read-tool exposure complete and verified on running local API.
- Remaining work / handoff: no work remains for this bounded request. Existing update-worker/Miro work remains owned by main thread. Production deployment and real-model response acceptance are not claimed.
