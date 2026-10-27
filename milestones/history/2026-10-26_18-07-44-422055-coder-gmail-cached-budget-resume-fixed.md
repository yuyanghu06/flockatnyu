# Cached completion at budget cap fixed

- Local timestamp / acting role / milestone: 2026-10-26_18-07-44-422055 / coder / gmail-cache-enrichment.
- Requested scope: separate Gmail cache -> Treg -> same enriched cache -> raw Contacts service.
- Starting state: independent bounded plan; actual sender cache049 supplied by a concurrent intake task.
- Work performed / changed files: Evaluator found an older paid-pending row could block later saved enrichment at the daily budget limit. Focused050 change prioritizes only current valid saved enrichment, with oldest-first order inside each group. Stale results after source edits are not promoted as free work.
- Decisions: no Gmail body fetch/transmission or LLM, raw native data preserved, existing records insert-only, explicit private logs, durable leases/versions/budgets, no cache deletion. Configured source/account is operational scope rather than invented per-row provenance.
- Checks and evidence: Initial eight actual SQL groups passed after the fix; independent tester then added the precise exhausted-budget/source-change regression. No unrelated SQL or source changes.
- Resulting state / acceptance: local implementation stages accepted and integrated; final overall verdict is local ACCEPT only.
- Remaining work/handoff: reviewed050 application and separate runtime activation/hosted verification remain pending. Never print tokens or copy real logs into committed evidence.
