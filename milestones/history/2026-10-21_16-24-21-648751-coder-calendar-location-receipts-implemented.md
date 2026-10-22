# Saved Calendar locations retained in receipts

- Role/scope: connector coder follow-up at explicit user request after screenshot showsmissingvenueconfirmation.
- Files: calendar-client.js, tools/calendar/chat.js andchat-batch.js, newcalendar-location-receipts.test.mjs; core integrates finalplanning/answerprojections.
- Behavior: carryactualprovider-returnedlocation throughsinglecreate/update/cancel/unchanged andbatchcreate/update/existingcache/publicprojection. Preserveexplicitblank; missingfield staysunknown. Neverfallbacktoarguments/priorread; bounded500characters/controlstrip. EventOutputomitsmissinglocationinsteadofinventingblank. Failuremetadataretainedthroughread/writewrappers.
- Checks:144/144finalfocusedGoogle/Calendarchecks; new14testsincludeactualHonomockedchat,nextplanning/finalanswerprojection.89/89connector/subscriptionpass; scopedwhitespacepass.
- Boundaries: nosourcewrites/liveprovider/model/schema/deployment. ExistingGooglegrant/idempotency/concurrency/fixedCalendartarget unchanged. Independenttest/reviewandhostedactivationpending.
