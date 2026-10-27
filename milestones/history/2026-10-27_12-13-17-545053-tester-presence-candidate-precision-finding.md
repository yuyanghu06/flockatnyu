# presence candidate precision finding

- Timestamp / role / milestone: 2026-10-27T12:13:17.545053-04:00 / tester / planner-presence-diagnosis.
- User scope: Fix diagnosed location-report failure; preserve unrelated work.
- Work / checks / findings: First candidate actual gpt-6-luna used8requests (shared16of48spent), selected correct independent Member Plans routing and nominal3PM end but explicit authored start dropped native subsecond precision. Backend correctly rejected invalid_request; zero Calendar/map writes, unfinished tasks and human data preserved. Prompt changed during this candidate, so it is diagnostic only, not frozen-source acceptance. Next correction instructs omission of new current-presence start so existing backend retains exact original instant. No permission weakening or limit changes.
- Evidence: Owned prompt/052/guide diff and ignored evidence/planner-presence-fix/.
- Status / next: No release acceptance; exact frozen-source actual-model original and saved-task recovery must pass before schema application/deployment.
