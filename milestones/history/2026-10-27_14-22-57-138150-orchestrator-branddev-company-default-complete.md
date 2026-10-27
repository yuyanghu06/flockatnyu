# Branddev company default complete

- Local timestamp / role: 2026-10-27_14-22-57-138150 / orchestrator.
- User scope: select Brand.dev as the company-enrichment provider.
- Starting state: implemented adapter with independently accepted tests; dormant routes retained.

Completed the user's Brand.dev company-provider selection. Company enrichment now uses a fixed Brand.dev GET through Treg, selecting the domain/website, email or name variant with documented precedence. All supplied inputs retain validation; LinkedIn-only input is rejected before dispatch instead of guessing a company. No hidden cross-service lookup, fallback or retry was added.

The existing public company fields are populated only from native values. Industry/address parts are display text; one unambiguous LinkedIn URL is supported. Employee exact counts and ranges remain visibly separate when both are supplied. Absent website/founding values stay absent, and the complete native body remains private and unchanged. Other lookup providers, people-search Exa selection, cost ceilings and authorization/logging/cancellation boundaries stay intact.

Independent tester and evaluator accept the change. All four saved Brand.dev responses pass the real client/authenticated HTTP handler, 50 affected groups pass, and the final registry refresh has 15 focused passing groups. Root API/format and package exclusion checks pass. Concurrent source moves, per-method handlers, formatting and unrelated project work were preserved. The client/helper are unreachable from the current web archive, so no empty or unrelated deployment was performed. No route was activated, no new paid/model/live business call was made, and no Contacts/cache/schema/environment data changed.

Provider selection is complete for the dormant company route. No required work remains. Future public integration remains a separate explicit request; do not claim the endpoint is live. No commit or push was performed for this pass.

Private scoped verification remains ignored under `evidence/treg-branddev-default/`. Credentials and provider payloads are excluded from this journal.
