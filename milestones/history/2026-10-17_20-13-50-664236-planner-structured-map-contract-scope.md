# Structured map contract scope

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664236-04:00 / planner / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Confirm actual storage and bound the prompt work.
- Starting repository state: Existing people/labels schema023 and scheduled event schema024; unrelated map/UI work in progress.
- Work performed / changed files: Inspected runtime prompt/handler, existing SQL contracts and live column metadata read-only. Actual event column is scheduled_events, not events_here. No database writes.
- Decisions: Reuse existing schemas, fixed catalogue and current privileges. Separate structured prompting from future tool registration.
- Checks and evidence: Local source and authenticated read-only column inspection; no model or source mutation.
- Resulting state / acceptance: Plan accepted: shared schemas/examples and runtime instructions with independent SQL/prompt tests.
- Remaining work and handoff: Implement within map contracts and automation prompt; preserve all applied SQL and UI.
