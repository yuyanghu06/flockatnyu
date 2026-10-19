# Stable catalogue continuation fixed

- Role / scope: coder; stable chat catalogues user request.
- Starting point: pending implementation atop4002929.
- Work / actual evidence: Removed the remaining adaptive two-round break and dead mapWorkflow state; global8rounds/8calls/dedup/cancellation remain. Updated obsolete prompt guidance and guide. Coder67focusedchecks/APIbuild/diffpass; independent source-to-Calendar regression and final re-review pending.
- Boundaries: no real source mutation, schema change or deployment in these passes. Source/service gates remain; semantic Calendar selection now belongs to the model.
- Handoff: finish independent regressions/review and configured-model semantic tests, then deploy reviewed package and verify live boundaries.
