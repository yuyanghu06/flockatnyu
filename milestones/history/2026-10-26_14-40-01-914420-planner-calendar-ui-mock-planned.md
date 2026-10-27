# Calendar UI mock planned

- Local timestamp / acting role / milestone: 2026-10-26T14:40:01.914420-04:00 / planner / calendar-ui-mock.
- Requested scope: Mock calendar view in a separate browser tab for substantial future design changes.
- Starting repository state: No standalone calendar screen; existing person Schedule/building activity lists. Current local map/Contacts and all dirty work retained.
- Work performed / changed files: Independent read-only planner inspected schedule UI, style guide and Vite routing. Proposed root calendar-mock.html plus isolated JS/CSS, week grid/Agenda, date navigation, sample all-day/overlap events and event details; mobile Agenda.
- Decisions: Synthetic events only, no API/model/Calendar calls or shared app imports. Existing ivory/black/pastel style. Leave Vite production inputs unchanged so this local draft stays out of ordinary releases. No category icons.
- Checks and evidence: Source inspection only. Existing Vite5173 can serve the new root HTML without config changes. Browser inventory confirms existing user Flock tab in Chrome; open a new tab after validation.
- Resulting state / acceptance: Plan accepted for bounded isolated implementation and browser tests.
- Remaining work: Build mock, test desktop/mobile interactions and network isolation, independently review and open user-facing tab.
