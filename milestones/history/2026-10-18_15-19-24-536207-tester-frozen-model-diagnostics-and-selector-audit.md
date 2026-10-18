# Frozen model diagnostics and strict fixture selector audit

- Local timestamp / acting role / milestone: 2026-10-18T15:19:24.536207-04:00 / tester / agent-prompts.
- Requested scope: verify real configured-agent behavior with synthetic sources and inert mutations.
- Starting repository state: source frozen after pacing, budget, deadline and weeklyrouting fixes; full932tests passed.
- Work performed / changed files: owned scripts/verify-agent-prompts.mjs and evidence/agent-prompts/live-model-results.json only. Transparent requestfactory tracing and actualdispatchspacing captured.
- Decisions: no instrumentation restarts for insignificant timerjitter; finalrun used at least1000ms actualdispatchgaps. Preserve interrupted diagnostics rather than presenting them as accepted finalruns. Strictfakeproviders must reject unknownMiroboard/item, CalendarpageToken, Calendarwindows withoutoverlap and wrongDiscordmessage IDs.
- Checks and evidence: frozen14run19:13:43.436Z–19:16:25.056Z,83realrequests,13/14diagnosticpasses,29monitoredfilesstable, minimumgap1000ms. SolefailedCalendaroccurrence inventedpageToken andemptyfinish_batch[]; no mapwrite, inputremainedpending. Fixtureaudit found Calendareditpass queriedwrongMiroboard and anoffsetCalendarwindow previouslyserved by permissivefake, so thatcase requirescorrectedrerun; failedCalendarcase alsohadwrongboard/token. Othercasesselectors consistent. Script syntax/no-modelflag safetygate pass.
- Resulting state / acceptance: behavioral acceptance pending narrowprotocolrecovery and strictfixturetargetedreruns. Sources stayed private/synthetic; no liveDiscord,Google orMiroreads/writes byharness.
- Remaining work and handoff: coder adds boundedemptyfinishfeedback, unobservedtokenvalidation anddeclaredconfiguredMiroboardenum; repeatCalendaroccurrence twice andcorrectedDiscordedit+Miroflow, independentreview andfinalregressionchecks.
