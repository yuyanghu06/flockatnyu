# Timed repair and general behavior contract

- Local timestamp / acting role / milestone: 2026-10-19_19-53-51-936269 / planner / general task behavior and timed corrections.
- Requested scope: repair timed schedule/correction failures and irrelevantlinks; improvebotbehavioracross tasks.
- Starting state: clean84740f9, priorall-daybatchrepairlive.
- Work performed / decisions / checks: Root private audit matched actual failures: run53cf9620 created26all-dayevents for an explicit timed schedule; runc5daf808 spent8rounds onCalendarpagination withoutedits; latesta95c0ff5 attemptedtwo corrections whichreturnedgoogle_unavailable. Independent planner identified all-day-only batchschema, lackofbulkcorrection, riskofGooglePATCHnesteddate/dateTime mixing, and unfilteredwebsite sourcefooter. User additionally requested general prompting/behaviorchanges. Scope: timed/all-day batches, exact-IDfreshrevision bulkpatches, targeteddiscovery, general constraint-preservingcompletion and relevantinlinecitations.
- Resulting state: implementation and independentverification available; finalreview/fullregressions/builds/deploymentpending.
- Remaining work: finishparentmodel/regressionacceptance, guardedrolloutandhostedchecks; nooriginalCalendarrequestreplay.
