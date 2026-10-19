# Timed batch and exact id correction implemented

- Local timestamp / acting role / milestone: 2026-10-19_19-53-51-936765 / coder / general task behavior and timed corrections.
- Requested scope: repair timed schedule/correction failures and irrelevantlinks; improvebotbehavioracross tasks.
- Starting state: clean84740f9, priorall-daybatchrepairlive.
- Work performed / decisions / checks: Implemented timed/all-day batchcreation, compactlocalclockshape with DSTgap/overlap rejection, exact-IDbatchupdate with hidden freshETag reads, unchangedretryandpartialreceipts, actualsavedtimingfields, HTTP400invalid_request mapping and explicitnull removal of incompatible date/dateTime/timeZone onGooglePATCHconversion. Addedboundedqueryand25itemCalendarpages(default5). UpdatedCalendarprompt/guides. Coder47focusedcheckspass, including26DSTinstances and26same-IDnestedPATCHcorrections. Existingfixedtarget/account/source/unsupported/invitationboundariesremain.
- Resulting state: implementation and independentverification available; finalreview/fullregressions/builds/deploymentpending.
- Remaining work: finishparentmodel/regressionacceptance, guardedrolloutandhostedchecks; nooriginalCalendarrequestreplay.
