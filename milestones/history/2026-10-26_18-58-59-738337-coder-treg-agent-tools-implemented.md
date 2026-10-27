# Separate Treg agent tools implemented

- Local timestamp / acting role / milestone: 2026-10-26T18:58:59.738337-04:00 / coder / treg-agent-tools
- Requested scope: Expose separate Treg people-search and array-email enrichment chat tools.
- Starting repository state: Existing unrelated work and Gmail-enrichment changes preserved; Treg clients existed outside chat tools.
- Work performed / changed files: Added tools/treg/index.js/info.md; wired tregTools through shared runtime, app, chat runner and strict assistant result projections; added prompt routing and append-only diagnostic names/statuses; added fixed optional chat enrichment feature label with worker default preserved. Root updated affected Contacts/Treg/folder guides. Existing unrelated changes preserved.
- Decisions: Lookup-only, separate calls, no Contacts/cache writes; six supported explicit string fields; raw full-call logs stay private.
- Checks and evidence: Root inspected adapter and registrations. Coder reports API build passing, Treg/import/enrichment/Contacts/runner checks passing; two Calendar diagnostics-privacy cases reproduce separately and remain under review. No paid/live Treg calls, data writes or deployment.
- Resulting state / acceptance: implemented; independent verification in progress
- Remaining work and handoff: Freeze source, complete independent offline and configured-model evaluation, assess unrelated Calendar failures, then evaluator review.
