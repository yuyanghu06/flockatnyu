# Contacts read path diagnosed

- Local timestamp / acting role / milestone: 2026-10-28T21:53:41.853185-04:00 / Planner / contacts-read-incident-2026-10-28.
- Requested scope: Read-only trace and bounded synthetic reproduction; inspect existing search/store/routes/migrations without runtime changes.
- Starting repository state: codex/planner-cost-reduction at e9e3098; existing modified planner journals and notes preserved. Production accepted release5e62ffe was already installed.
- Work performed / changed files: Full native rows cross the 256,000-byte store cap before the six-field projection. SQL returns limit+1 to detect another page. Synthetic 11-row response of 332,081 bytes fails while smaller synthetic pages pass. Existing focused SQL/native/HTTP tests reported15/15; these do not reproduce large production pages. Parent serializes journal entries; tester owns only ignored safe diagnostic script/results under evidence/contacts-read-incident-2026-10-28/.
- Decisions: Diagnose before proposing remediation. Counts and bytes are separate limits; preserve full native raw data and human edits.
- Checks and evidence: server/contacts/store.js:7,134; server/contacts/search.js:74; migration051:122,131; evidence/contacts-read-incident-2026-10-28/initial-probes.json and independent-verification.json. Evidence contains safe statuses, sizes and counts only; credentials/cookies stay in memory.
- Resulting state / acceptance: Planner diagnosis accepted as corroborated by hosted probes. Native raw storage and exact version checks must be preserved in any future fix.
- Remaining work and handoff: Independent final evaluation pending. Lightweight directory projections are recommended only; no remediation is implemented or deployed. First-page behavior does not establish every profile/page or the historical incident start.
