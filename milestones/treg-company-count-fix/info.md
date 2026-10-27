# Company employee-count compatibility

Fix the two observed company-enrichment response failures without activating dormant routes. The client will display safe numeric employee counts as text while retaining the original provider response in private logs. Existing text, null and missing values stay intact; invalid counts remain rejected.

Completion requires replay of both saved failures through real client/HTTP code, meaningful boundary tests, independent review and confirmation that the deployed package is unchanged. The orchestrator owns tracking documents. Private evidence stays ignored; current status lives in ../milestone.md.

Status: complete. Both original responses pass offline client/HTTP replay; 44 affected groups, API build and independent review pass. Native logs and invalid-value checks remain intact. The website package is unchanged because these handlers remain dormant; no deployment or activation was performed.
