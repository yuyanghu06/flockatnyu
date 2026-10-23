# Complete count independently reviewed

- Local timestamp / acting role / milestone: 2026-10-23T15:08:28.373450-04:00 / evaluator / tool-isolation-audit.
- Requested scope: quick read-only audit of all tools available across application agents against the new isolated-tools rule.
- Starting repository state: rootfba416a and newer separate testing candidate; existing edits preserved.
- Work performed / changed files: Independent final source evaluation confirms create_calendar_events embeds Calendar scan/match/choose/create and must be counted. update_calendar_events exact-ID revision/preservation read is excluded. Accept root11/43 and candidate12/44 with distinct-name counting and source-only deployment limits.
- Decisions: count each public name once; identify agent-specific variants, hidden business operations and runner workflows separately from mechanical authentication/local validation/exact-record version checks.
- Checks and evidence: static source call chains and read-only diffs; final combined evidence and full ledger in docs/tool-isolation-audit-2026-10-23.md. No inference or live business calls; no new application tests necessary for a read-only audit.
- Resulting state / acceptance: assigned audit pass complete; no runtime correction or deployed behavior change is claimed.
- Remaining work and handoff: user receives counts and affected tools; implementation remains separate. Orchestrator owns journal integration.
