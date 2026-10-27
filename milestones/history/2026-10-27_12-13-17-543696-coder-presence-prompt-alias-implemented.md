# presence prompt alias implemented

- Timestamp / role / milestone: 2026-10-27T12:13:17.543696-04:00 / coder / planner-presence-diagnosis.
- User scope: Fix diagnosed location-report failure; preserve unrelated work.
- Work / checks / findings: Prompt now distinguishes independent presence and old-task reclassification; additive052 appends eLab with exact identity guard, transaction/table lock and restored timestamp trigger. Existing74focusedchecks pass; inline actual-validator PGlite checks cover append/timestamps/idempotence/matching/trigger/grants/conflict. No live changes. Actual-model acceptance remains pending.
- Evidence: Owned prompt/052/guide diff and ignored evidence/planner-presence-fix/.
- Status / next: No release acceptance; exact frozen-source actual-model original and saved-task recovery must pass before schema application/deployment.
