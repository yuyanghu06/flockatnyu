# Missing-person map contract reviewed

- Local timestamp / acting role / milestone: 2026-10-19T14:07:32.855278-04:00 / planner / planner operational diagnosis.
- Requested scope: distinguish an unregistered person from a failed planner run for a reported Bobst plan.
- Starting repository state: existing planner live, private audit enabled, separate source/tool operational issues remain; concurrent docs changes preserved.
- Work performed / changed files: Independent read-only planner inspected fixed-profile lookup, adapter identity receipts, map visibility and completion validation. Missing/untrackable exact identities return ready with person null, not a tool failure. Profiles cannot be created; changed participation requires a successful linked-person receipt. Informal events without eligible participants remain invisible. Pending input completion is not equivalent to a personal plan being projected.
- Decisions: report both confirmed limitations; do not claim the exact pasted exchange was processed or the identity lookup caused an observed tool failure. Do not add a person or fabricate location/timing.
- Checks and evidence: Static source and existing test assertions inspected; no runtime tests or mutations.
- Resulting state / acceptance: diagnosis complete with explicit exact-message limitation; journals only.
- Remaining work and handoff: repair recurring planner map-read failures and queue progress separately. Adding/linking a new profile is a separate authorized action; ambiguous return times remain uncertain.
