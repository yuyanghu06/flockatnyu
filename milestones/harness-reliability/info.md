# Harness failure recovery

Goal: recover temporary inference failures and stop repeatedly failing inputs from blocking newer updates. Implemented provider retry classification/deadlines/per-attempt audit, queue singleton isolation/fairness, five-failure quarantine with24-hour payload expiry and service-only scoped recovery. Search and channel scheduling remain separate follow-ups.

Local completion criteria passed: independent synthetic provider and real PGlite SQL tests, evaluator acceptance, full1858passing regressions plus one existing optional skip, API/frontend builds and documentation. Migration036 is not hosted/applied by this work; apply it before updated worker deployment. Actual release status and latest history remain in the rolling milestone. Parent owns shared journal; implementation/test ownership stayed disjoint. Retention cleanup requires scoped polling and preserves changed replacement bodies for private review.

The 2026-10-22 combined release supersedes earlier local-only or blocked status: all four Railway services report SUCCESS, reviewed migration 036 is applied, all 27 portraits are verified, and the working-tree features are published in logical GitHub commits. See the rolling milestone and combined-release receipt for the checks and limitations. Saved future ideas and unrequested business mutations remain separate.
