# total count behavior and layout accepted

- Local timestamp / acting role / milestone: 2026-11-13T16:26:49.975946-05:00 / tester / contacts-total-count-2026-11-13.
- Requested scope: Show the total number of saved Contacts on the right, inline with the existing loaded-row count, then deploy web.
- Starting repository state: Managed worktree contacts-total-count based on main9a3b6db; original checkout and its existing modified/untracked journals remain untouched. Prior Contacts release web5afefed2 succeeded November9.
- Work performed / changed files: Independent tester extended existing HTTP/native/summary fixtures and browser smoke checks; no app edits. Inspected actual synthetic desktop and320px screenshots.
- Decisions: Overall saved-contact total, unchanged by current search/filter. Private exact HEAD count; no raw profile download, SQL migration, model/provider changes or business-data writes. Existing list count stays left.
- Checks and evidence: Nineteen focused cases and six browser flows pass.10 shown/14 total same row; load14, filterone/zero retain14; unavailable count leaves rows; create15/delete14 refresh totals. Count HEAD downloads no records or writes. Mobile/desktop y positions match and no overflow. Existing raw/auth/map/chat checks pass.
- Resulting state / acceptance: Tester ACCEPT local behavior and appearance; full CI still running.
- Remaining work and handoff: Wait for full CI, final evaluator local acceptance, then commit/push/main release and web-only deployment.
