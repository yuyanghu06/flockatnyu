# Planner cache context and copy fixes implemented

- Local timestamp / acting role / milestone: 2026-10-28T12:29:48.114204-04:00 / coder / planner-cost-reduction-2026-10-28.
- Requested scope: implement planner cost remedies, preserve correct outcomes and prepare a three-day follow-up.
- Starting repository state: codex/planner-cost-reduction; original source298b7d0 and pre-existing documentation edits preserved.
- Work performed / changed files: Added directOpenAIplanner-only stable wire schemas, fixed-prefix explicit boundary with normal implicit caching and separate trusted clock; exact runner refs/validation remain. Added attempt/finalization hooks and extracted model-context helper. Early retirement now includes undisclosed catalogue/fragment/history dependencies conservatively. Added narrow wrappernesting and exact-copy event field/URL instructions after simulated model failures.
- Decisions: keep retry bookkeeping separate from saved reads, exact authorization/version checks intact, prompt workflows separate from service operations and model/settings unchanged.
- Checks and evidence: New codec/provider/runner/preservation checks pass. Evaluator reproduced and caught unread-shared-event retirement; writer fixed it, root updatedtwo obsolete expectations to preserve unknown dependencies.26 selectedpreservation checks pass; handler755/769 andprovider476/500. No model/settings/time/call cap changes.
- Resulting state / acceptance: Implementation and required preservation correction complete; final runtime pinned. Held fragment-ID/audit-cleanup work unchanged.
- Remaining work and handoff: finish final CI, record final evaluator decision and concrete release readiness. No live migration, deployment, worker activation, forced cycle or business write occurred.
