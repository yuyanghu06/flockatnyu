# Existing event attendance prompt contract

- Local timestamp / acting role / milestone: 2026-10-22T20:25:04.750875-04:00 / planner / live-planner-calendar-tests and contextual-event-attendance.
- Requested scope: Natural Discord behavior tests, exact cleanup and contextual existing-event attendance correction.
- Starting repository state: Concurrent dirty tree and accepted deployed discovery repair; preserve other work.
- Work: Read-only independent planner traced existing history through runner/tools; no history parser change needed. Coder owns only shared chat guidance/context and map tool descriptions.
- Decisions: Look up authorized existing events before asking hours/creating a plan; use normal Calendar fallback when no usable map match. Unique timed occurrence supplies hours; contextual “the entire time” inherits that occurrence, never all day. Preserve facts, human edits, other attendees and revision. Ambiguity/failures require honest clarification. Explicit independent/all-day plans remain valid. Calendar-only match cannot justify a duplicate personal map plan.
- Acceptance: Bounded configured-model tests with actual production runner/service and simulated storage; independent review; narrow web release and live disposable-event check. No schemas/identity/source checks/budgets/worker changes.
- Remaining: Implementation, tests, review and rollout.
