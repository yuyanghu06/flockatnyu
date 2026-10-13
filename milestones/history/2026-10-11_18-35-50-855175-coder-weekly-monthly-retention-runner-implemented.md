# M20 weekly/monthly retention runner implemented

- Local timestamp / acting role / milestone: 2026-10-11T18:35:50.855175-04:00 / coder / M20.
- Requested scope: No daily summaries; mixed-input weekly/monthly retention and NY cadence.
- Starting repository state: Corrected planner complete; prior technicalbaseline191passed;006unapplied/storage lifecycle rewrite active.
- Work performed / changed files: summary-config/summaries/summary-cli andnewsummary-schedule implement explicitbootstrap/weekly/monthly/scheduled modes, fullraw/verifiedsummary segmentcoverage, source-bound inheritedcitations, separateprocessed/representedcounts, post-pruneclosed-operation cache anddurablependingresume. Reportretention-runner-coder-report.md.
- Decisions: WeeklyMonday08NY, monthlyfirst08NY; Mondayfirstmonthlypriority, currentmonthweeklyeligibilityempty. Delayedstart within08hour fixed08:00asOf/cutoff, UTC12/13DSTslots. Strictcalendar rejectsFeb30. wait_for_sync blocksmodeldispatch/falsecompletion. No uncheckedrunnerdeletes.
- Checks and evidence: Four syntaxchecks, combinedprovider/runner/scheduler49/49passed; cleanenvbootstrap nonzero/not_configured. Rootinspectedactualfiles/report. No model/schema/deploy/liveprune.
- Resulting state / acceptance: Coderpass accepted, independentSQLretention/scale/fullintegration/evaluator not yet accepted. Provider andsourceACL/images/vector constraints preserved.
- Remaining work and handoff: Finishatomicstorage+collectorledger lifecycle, test/evaluate, thenreviewed006/actualAPIpreview/pilot/allhistoryprune andscheduledRailwaycontinuation.
