# Harness failure recovery

Goal: recover temporary inference failures and stop repeatedly failing inputs from blocking newer updates. Implemented provider retry classification/deadlines/per-attempt audit, queue singleton isolation/fairness, five-failure quarantine with24-hour payload expiry and service-only scoped recovery. Search and channel scheduling remain separate follow-ups.

Local completion criteria passed: independent synthetic provider and real PGlite SQL tests, evaluator acceptance, full1858passing regressions plus one existing optional skip, API/frontend builds and documentation. Migration036 is not hosted/applied by this work; apply it before updated worker deployment. Actual release status and latest history remain in the rolling milestone. Parent owns shared journal; implementation/test ownership stayed disjoint. Retention cleanup requires scoped polling and preserves changed replacement bodies for private review.
