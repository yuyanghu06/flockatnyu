# Contacts production size cap confirmed

- Local timestamp / acting role / milestone: 2026-10-28T21:53:41.853186-04:00 / Tester / contacts-read-incident-2026-10-28.
- Requested scope: Independently reproduce production Contacts failure with read-only bounded probes.
- Starting repository state: codex/planner-cost-reduction at e9e3098; existing modified planner journals and notes preserved. Production accepted release5e62ffe was already installed.
- Work performed / changed files: Independent eight-request check exits0. Production lists10and5 fail503 response_too_large; list1 returns200 ready. Underlying search returns200 with291451bytes/11rows and277472bytes/6rows. The two largest sampled raw records (102839and97628compact JSON bytes) each read200through exact website routes. No raw payload or identity saved. Parent serializes journal entries; tester owns only ignored safe diagnostic script/results under evidence/contacts-read-incident-2026-10-28/.
- Decisions: Diagnose before proposing remediation. Counts and bytes are separate limits; preserve full native raw data and human edits.
- Checks and evidence: server/contacts/store.js:7,134; server/contacts/search.js:74; migration051:122,131; evidence/contacts-read-incident-2026-10-28/initial-probes.json and independent-verification.json. Evidence contains safe statuses, sizes and counts only; credentials/cookies stay in memory.
- Resulting state / acceptance: Diagnosis independently confirmed; other pages/individual records were not scanned. No fix, source/model call, business mutation, configuration change or deployment occurred.
- Remaining work and handoff: Independent final evaluation pending. Lightweight directory projections are recommended only; no remediation is implemented or deployed. First-page behavior does not establish every profile/page or the historical incident start.
