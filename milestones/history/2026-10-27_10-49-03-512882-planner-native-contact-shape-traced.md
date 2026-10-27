# Native contact shape traced

- Local timestamp / acting role / milestone: 2026-10-27T10:49:03.512882-04:00 / planner / treg-contact-diagnosis.
- Requested scope / starting state: Read-only planner traced native raw storage and flat-only projections. No edits or live calls. Existing dirty worktree preserved.
- Work performed / changed files / decisions: Production worker saves enrichment.raw unchanged; API/model/SQL search only read top-level six fields. Nested names can appear blank. Exact email absence required live confirmation. Recommended explicit shared projection, equivalent SQL search and preservation of manual clears/native JSON.
- Checks and evidence: Source trace only; no tests or deployment.
- Resulting state / acceptance / remaining work: Plan accepted; implement shared native projection and separately capture input email.
