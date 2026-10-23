# Source tool audit

- Local timestamp / acting role / milestone: 2026-10-23T15:08:28.373449-04:00 / planner / tool-isolation-audit.
- Requested scope: quick read-only audit of all tools available across application agents against the new isolated-tools rule.
- Starting repository state: rootfba416a and newer separate testing candidate; existing edits preserved.
- Work performed / changed files: Independent source trace covers22source/CRM/memory/report names. Chat read_discord_window silently runs nested model summarization on large windows; the remaining21have no identified isolation violation in their source adapters. Auth/pagination/local metadata are excluded.
- Decisions: count each public name once; identify agent-specific variants, hidden business operations and runner workflows separately from mechanical authentication/local validation/exact-record version checks.
- Checks and evidence: static source call chains and read-only diffs; final combined evidence and full ledger in docs/tool-isolation-audit-2026-10-23.md. No inference or live business calls; no new application tests necessary for a read-only audit.
- Resulting state / acceptance: assigned audit pass complete; no runtime correction or deployed behavior change is claimed.
- Remaining work and handoff: user receives counts and affected tools; implementation remains separate. Orchestrator owns journal integration.
