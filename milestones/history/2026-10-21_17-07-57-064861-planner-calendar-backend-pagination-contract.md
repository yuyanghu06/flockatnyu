# Calendar backend pagination contract

- Local timestamp / acting role / milestone: 2026-10-21T17:07:57.064861-04:00 / planner / tool failure diagnostics.
- Requested scope: five-minute summary, backend Calendar pagination and reduced map overhead.
- Starting repository state: existing extensive local changes preserved.
- Work performed / decisions / checks: Preserve low-level single-page listEvents for internal batch duplicate checks. Add agent-facing backend traversal with20pages,200uniqueevents,14KiB event budget within16KiB envelope and one60second source deadline. Hide cursors from model, retain bounded partial evidence, withhold content on access failure, and require complete unfiltered worker reconciliation coverage. Exact-window/mode/query tracking and completion feedback must avoid identical partial scans. Source inspection only; implementation and independent tests assigned.
- Resulting state / acceptance: pass inspected; combined independent verification pending.
- Remaining work / handoff: Calendar and map implementation, independent tests, evaluator review. No live writes or deployment.
