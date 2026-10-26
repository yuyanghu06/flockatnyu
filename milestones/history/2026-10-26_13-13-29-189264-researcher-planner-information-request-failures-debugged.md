# Planner information request failures debugged

- Local timestamp / acting role / milestone: 2026-10-26T13:13:29.189264-04:00 / researcher / planner-logging-review-2026-10-26.
- Requested scope: Identify concrete reasons for failed source reads, fragments, lookups and malformed proposals.
- Starting repository state: prior review journal changes preserved; no application implementation changes in this pass.
- Work performed / changed files: All seven failed fragment reads used nonexistent IDs at offset0 during initial Discord/tool reading, including five all-zero IDs. One identity URL omitted the guild; seven likely lacked a current source observation for older work. One channel is absent current catalogue. Both attendance patches chose the same currently Discord-backed event, outside the pinned Calendar sources. Parent rechecked all five404targets through current production policy and bot permissions: only exact-message endpoints404, all access endpoints200. Deleted versus wrong historical IDs remains unknown.
- Decisions: diagnosis only; preserve source permissions, fixed catalogues, exact versions and unfinished tasks.
- Checks and evidence: Seven offline production-function reproduction groups passed. Exact search max16versus8, parameters-versus-arguments wrapper, malformed Discord URL, Discord key used as Calendar ID, mismatched task owner and no-change/retained-task completion cases found. Four older fixture checks failed before intended assertions because compact reads no longer fragmented; no tests changed. Private original arguments and identities not copied into committed evidence.
- Resulting state / acceptance: independent evaluator ACCEPT for qualified diagnosis; no claim all historical causes were recoverable.
- Remaining work and handoff: debug-causes.md records proposed corrections and evidence limits.
