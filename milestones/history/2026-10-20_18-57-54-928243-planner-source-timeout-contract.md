# Shared source tool timeout contract

- Local timestamp / acting role / milestone: 2026-10-20T18:57:54.928243-04:00 / planner / sixty-second source checks.
- Requested scope: user authorizes raising general source/tool checks to sixty seconds after reproduced map deadline failures.
- Starting repository state: diagnosis-only journal edits; runtime unchanged.
- Work performed / changed files: independent read-only inventory of shared map, Google, Discord, Miro, memory and active bug-report tool deadlines, runtime overrides and deployment closures. No specialist edits or external calls.
- Decisions: shared60second default for source operations and inner transports; remove shorter map defaults/ceiling and runtime overrides. Google OAuth transport, Discord directory/context/policy, Miro quota preflight/store and active memory/bug-report calls included. Preserve explicit shorter injected overrides, existing longer aggregate Discord budgets, current request/worker limits, model/audit/lease/body/collector lifecycle deadlines. Parent assigns implementation and independent test ownership.
- Checks and evidence: static deadline inventory; planned tests cover former cutoff survival, sixty-second expiry, parent cancellation, authorization, package closure and unchanged quotas. No tests claimed in this planning pass.
- Resulting state / acceptance: contract accepted; implementation/testing underway. Parent owns docs/deployment and shared journal.
- Remaining work and handoff: test/review, read-only source reproduction, guarded web+worker deployment and observed queue progress. Timeout increase alone does not establish backlog drainage.
