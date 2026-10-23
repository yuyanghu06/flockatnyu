# Explicit missing-map attendance stop

- Timestamp / role / milestone: 2026-10-22T20:30:24.191817-04:00 / coder / contextual-event-attendance.
- Requested scope / starting state: EvaluatorREQUESTFIXES onfirstcandidate; same3ownedpromptfiles only.
- Work: Scheduled attendance requires exact existing map UUID from current authorized read; providerCalendarID is different. Calendar-only match can supplycontext/hours but muststopupsert, projection/reconstruction, inventedmetadata and creationretries; report attendanceunsaved. Explicitseparate/allDayplans preserved. No executioncode ordatachanges.
- Checks: APIbuild,11existingbehaviorcases, scopedwhitespacepass.
- Acceptance / handoff: Correctedsource frozen; independent4caseconfiguredmodelretest and evaluatorreview pending; isolatedwebpackage refreshedonlythese3files. Notdeployed.
