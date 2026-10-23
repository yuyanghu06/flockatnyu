# Contextual attendance prompt implementation

- Local timestamp / role / milestone: 2026-10-22T20:26:07.777906-04:00 / coder / contextual-event-attendance.
- Scope / starting state: Frozen bounded prompt contract on concurrent dirty source; preserve prior audit corrections.
- Files: server/chat-behavior.js, server/assistant-context.js, tools/map/chat.js.
- Work: Existing map then normal Calendar lookup precedes timing questions/new activity; unique timed match supplies hours; contextual entire-time clarification inherits full event interval; exact attendance snapshot preserves other people/facts/revision; ambiguity/failures remain uncertain; explicit independent/all-day plans remain valid. Calendar-only match cannot create duplicate personal map activity.
- Checks: API build and11existing behavior checks pass; whitespace passed. Parent inspected narrow added guidance. No execution code/schema/budget/source changes.
- Acceptance / handoff: Independent configured-model evaluation pending; web-only isolated package must use deployed a87baseline plus exactly these three files.
