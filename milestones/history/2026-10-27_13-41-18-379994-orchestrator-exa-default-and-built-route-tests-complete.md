# Exa default and built route tests complete

- Local timestamp / role: 2026-10-27_13-41-18-379994 / orchestrator.
- Requested scope: Exa search default and tests of existing selected-provider routes.
- Starting state: reviewed local changes and bounded live tests; unrelated edits preserved.

Completed both user requests: Exa is the live default for people search, and the other built operations were tested using only their currently selected providers. Local tests passed 61 affected groups; independent source, package, result and hosted reviews accepted the evidence. The web package changes only three intended runtime modules; no other service was deployed and no environment or provider policy was changed. Native provider JSON and existing human edits remain intact.

The separate existing-route run made 28 requests for $0.012855, exactly matching the balance decrease, with no unknown charges. Email finding returned 2/10, phone finding 5/10, verification one valid and one risky/false verdict, and person enrichment two matching profiles from the two actually found addresses. Company enrichment accepted 2/4; two charged records failed because numeric employee counts violate the route's text-only contract. This is a documented follow-up bug outside the test request. Accuracy, phone ownership and deliverability are unverified. No addresses were guessed and no Contacts/cache writes, email sends, provider sweep or route activation occurred.

The hosted Exa release check added one $0.007 search, so this follow-up used $0.019855 in observed Treg charges, below the user's $10 ceiling. Prior search-comparison charges remain separate. Cleaned only the temporary deployment directory created by this pass after independent acceptance. No required implementation or testing work remains; no commit or push was requested or performed. Preserve unrelated working-tree changes.

Evidence is private under ignored `evidence/treg-exa-release/`, `evidence/treg-exa-default/` and `evidence/treg-built-route-benchmark/`. Personal result values and credentials are excluded from this journal.
