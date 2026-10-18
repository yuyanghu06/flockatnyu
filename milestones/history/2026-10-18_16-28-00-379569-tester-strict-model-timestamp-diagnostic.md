# Strict model timestamp diagnostic

- Local timestamp / acting role / milestone: 2026-10-18_16-28-00-379569 / tester / final model acceptance
- Requested scope: strictactualschema modelbehavior, no live sourcewrites.
- Starting repository state: queuedfirst andMirofeedbackfrozen.
- Work performed / changed files: ownedmodelharness andaggregateevidence only.
- Decisions: retainfailedrun andstrictassertions; fixsource-ownedtimestampbinding.
- Checks and evidence: Fourstrictgpt-6-lunascenarios actualMiroadapter/parser:3/4pass,38modelcalls/31stablehashes. Calendarprojection, Discordcreate andMiroCalendarMapRSVPpass. DiscordeditcorrectCalendarwrite+exactread, butmodelcopiedoldmapreported_at14:00insteadcurrentCalendar16:00; sourceguardforbidden_source preventedmapwrite andinputcompletion. Assertionsunchanged. Fixservercanonical Calendarreported_at fromobservedcurrentoriginal beforehash, no clockfallback; finalsame4rerunpending.
- Resulting state / acceptance: diagnostic3/4, sourcefenceworked; finalacceptancepending.
- Remaining work and handoff: narrowcanonicaltimestampfix/review,4samecases, finalworkerrollout.
