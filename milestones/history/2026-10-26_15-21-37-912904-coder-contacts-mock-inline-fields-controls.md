# Contacts mock inline fields and raised controls

- Local timestamp / acting role / milestone: 2026-10-26T15:21:37.912904-04:00 / coder / contacts-design-mock.
- Requested scope: Raised gray Edit, red square × Delete, all six fields directly editable in recessed white text boxes.
- Starting repository state: Accepted inline header and raised avatars; existing user changes preserved.
- Work performed / changed files: Only src/contacts-mock.js/css. Reuse editor inline under the persistent profile header. Initialize drafts on read, focus-only Edit, dirty-only Save/Cancel, baseline reset and versioned partial saves. Creation retains separate title/footer. Header red 34px square × has accessible Delete contact name and confirmation above the fields; opening it preserves draft. Edit uses neutral gray raised shading. Inputs and notes retain white fill with inward shadows, including focus.
- Decisions: Explicit save, no autosave. Keep mock-only data, draft/navigation checks and original real application unchanged.
- Checks and evidence: Coder node syntax and whitespace pass. Root inspected actual Chrome screenshot and accessibility state: all six labeled fields editable; gray Edit, red × and recessed surfaces visible. Independent behavior/geometry checks pending.
- Resulting state / acceptance: Implementation frozen, ready for verification.
- Remaining work and handoff: Tester checks meaningful local draft/save/clear/confirmation flows and mobile layout; evaluator reviews final evidence.
