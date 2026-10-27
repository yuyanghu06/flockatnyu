# Preserve exact original presence timestamp

- Timestamp / role / milestone: 2026-10-27T12:14:08.530904-04:00 / coder / planner-presence-diagnosis.
- Scope and starting state: Correct actual-model precision failure without weakening backend checks; unrelated work preserved.
- Change: Prompt and prompt guide instruct omission of start for NEW current presence so existing backend retains the exact original instant, including fractional seconds. Supported departure is supplied independently; no-end original-plus-two-hour default remains.
- Verification: Syntax/scoped whitespace pass; prompt frozen3d3a931f6520f9e29d74ef15852e1e2103c414c3921ab5e4d506c5d8237334e9. Root API syntax/dependency build passes. Independent durable actual-SQL migration test passes; original and saved-task actual-model evaluation remains running.
- Package: Frozen62-file isolated worker differs from deployed source041b280 only in prompt.js. Unrelated dirty shared diagnostics restored to deployed bytes inside package. Schema migration remains separate from upload. No deployment or hosted catalogue changes yet.
- Result / next: Candidate ready for bounded final-model checks and evaluator acceptance, followed by exact migration application and worker-only release. No final behavioral acceptance claimed.
