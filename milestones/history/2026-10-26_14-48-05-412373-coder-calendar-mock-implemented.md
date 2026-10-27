# Calendar mock implemented

- Local timestamp / acting role / milestone: 2026-10-26T14:48:05.412373-04:00 / coder / calendar-ui-mock.
- Requested scope: Isolated editable calendar mock in a separate browser tab.
- Starting repository state: Accepted sample-only plan; all existing application/userchanges retained.
- Work performed / changed files: Added calendar-mock.html,src/calendar-mock.js/css only. Week/Agenda, previous/next/Today, two samplecalendar filters, all-day strip, overlap lanes, upcoming shortcuts and native eventdetails with close/Escape/backdrop/focusrestore. Nine invented events in editable SAMPLE_EVENTS block; mobileAgenda and scrollableexplicitWeek.
- Checks and evidence: Normal JS syntax, whitespace and frontendbuild pass. Verified dist/calendar-mock.html absent afterbuild; Viteinputs/mainapp/server untouched. NoAPI/model/storage/imports/externalwrites.
- Resulting state / acceptance: Prototype implemented and user-facing tab open; final independent checks pending.
- Remaining work and handoff: Finish mobile/network/browser review and record acceptance. Keep mock out of production build.
