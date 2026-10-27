# Approved Contacts design ported to real UI

- Local timestamp / acting role / milestone: 2026-10-26T15:37:34.970560-04:00 / coder / contacts-site-release.
- Requested scope: Apply the approved mock to the actual website.
- Starting repository state: Prior real Contacts UI/API and approved mock are local; no release yet.
- Work performed / changed files: Only src/contacts.js/css. Ported inline avatar/identity/red ×, always-editable recessed fields/Notes, dirty Save/Cancel, baseline initialization, raised avatars/paging and recessed search. No Edit/footer/subtitle.
- Decisions: Preserve real createContactsClient import/default, limits, exported interface, lifecycle/map/assistant isolation and API/error/conflict/uncertain-write paths. No samples, memory client, mock boot, automatic selection, extra public methods or global framing styles.
- Checks and evidence: Coder syntax/whitespace pass. Root compared real/mock result: only intentional production client/export/lifecycle and absent mock framing differ. Both frontend and API builds pass; frontend retains existing large-chunk warning. Independent browser/API checks pending; source-only package preparation in progress.
- Resulting state / acceptance: Real UI implemented and frozen for review.
- Remaining work and handoff: Tester updates meaningful production-path browser checks; evaluator/package review before web-only release.
