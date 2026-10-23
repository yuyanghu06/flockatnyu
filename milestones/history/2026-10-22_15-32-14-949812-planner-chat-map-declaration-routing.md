# Chat map declaration routing plan

- Local timestamp / acting role / milestone: 2026-10-22T15:32:14.949812-04:00 / independent planner, serialized by orchestrator / chat-map-clarification.
- Requested scope: Follow-up replacing original-source identity requirements with ask-person / insufficient-information gating; update-agent authorization remains the backend responsibility.
- Starting state: Prompt coder owns only shared identity prose; concurrent Member Plans staged pipeline owns automation, source-authorizer and migration changes.
- Work performed / changed files: Read-only trace of map event service/source authorization/attendance provenance and event SQL, plus active staged-pipeline contract. No runtime edits.
- Decisions: Recommend handing clarified declarations to Member Plans Calendar pipeline if user selects worker handoff. Clarified names are reported identities, never fabricated provider IDs. A direct-save alternative requires a real server-owned chat-declaration source namespace. Either route must preserve pending user facts through short name replies and distinguish queued from saved results.
- Checks and evidence: Static source inspection. Removing tools/map/chat.js gates alone cannot bypass shared authorizeProvenance, original provider authorizer or nonnull immutable event provenance. Existing attendance marker binds to an existing scheduled event, not standalone presence. No tests, model calls or external mutations.
- Resulting state / acceptance: Revised plan received; routing question is pending user response. Prompt clarification can proceed independently, dependent persistence changes cannot.
- Remaining work and handoff: Complete/review prompt changes, await chosen write route, coordinate reserved files with staged pipeline. No hosted changes claimed.
