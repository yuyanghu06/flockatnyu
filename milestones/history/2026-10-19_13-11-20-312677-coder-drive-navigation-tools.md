# Drive navigation tools

- Acting role: coder; user-authorized read-only Drive skill integration.
- Starting state: independent planning accepted; concurrent unrelated edits preserved.
- Work performed: Google client/tools and planner adapter now expose live folder pages and literal parent-scoped search, with safe cursors and metadata. Existing Google/prepared-batch gates retained; only Gmail continues to register Google write evidence.
- Decisions: private metadata remains outside Git; school connector never substitutes runtime credentials; no Drive contents register new Calendar/map provenance.
- Checks: 62 focused tests and 135 related regression tests passed per coder report; scoped whitespace passed.
- Result: implemented locally, independent acceptance/review pending. No source writes or deployment by this pass.
- Handoff: finish independent lifecycle/pagination/package verification, evaluate and release with current compatible baseline.
