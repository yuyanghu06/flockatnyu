# Planner storage fix recommended

- Local timestamp / acting role / milestone: 2026-10-23T19:30:58.739530-04:00 / orchestrator / planner storage recommendation.
- Requested scope: explain how to fix the diagnosed saved-task loading bottleneck; recommendation only.
- Starting state: concurrent Spotlight release and separate setup/documentation work preserved. No runtime or test edits by this pass.
- Evidence reviewed: current Git state, rolling journal, pipeline/store and migration039 plus read-only planner specialist report. Five full-list loads remain in current code; fixing finish alone leaves startup and phase transitions exposed.
- Decision: recommend a small authorized task catalogue plus targeted complete saved-task reads. Load full originals only for selected tasks/current claimed-original matches, and check exact relevant task snapshots at completion. Preserve current source/expiry/lease/content/version/read-receipt/resolution checks and all untouched tasks. Retain fixed safe storage failure categories, status, timing and response size instead of erasing the underlying cause. No call-limit or timeout adjustment is part of the recommendation.
- Acceptance criteria: synthetic131large-task production-runner storage checks, stale/expired/revoked/lost-lease/failure/preservation cases, and measured hosted pureSELECT query shapes under existing limits. A small returned catalogue does not by itself prove a fast database query. No new inference, source or business writes, migration, deployment or benchmark was run in this recommendation pass.
- Result: recommendation complete, implementation and verification remain future work. Planner detail: 2026-10-23_19-30-58-739530-planner-task-catalogue-targeted-read-recommendation.md.
