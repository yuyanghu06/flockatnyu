# Separate Treg agent tools planned

- Local timestamp / acting role / milestone: 2026-10-26T18:56:07.439165-04:00 / planner / treg-agent-tools
- Requested scope: Expose separate Treg people-search and array-email enrichment chat tools.
- Starting repository state: Existing unrelated work and Gmail-enrichment changes preserved; Treg clients existed outside chat tools.
- Work performed / changed files: Read-only planner reviewed Treg clients, shared runner, strict result projection, auth, diagnostics and deployment packaging. Coder owns adapter/runtime integration; tester owns new behavioral and model harness files; root owns journals/guides.
- Decisions: Lookup-only, separate calls, no Contacts/cache writes; six supported explicit string fields; raw full-call logs stay private.
- Checks and evidence: Read-only source inspection and official public catalog contract: routed enrich accepts one email; array tool must make separate calls. No paid calls or live changes.
- Resulting state / acceptance: implementation in progress
- Remaining work and handoff: Complete coder implementation, then run independent offline and actual configured-model checks, review and integrate.
