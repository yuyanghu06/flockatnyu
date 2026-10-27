# Multi-event Calendar identity limitation confirmed

- Local timestamp / acting role / milestone: October26,2026,9:46PM NewYork / read-only Planner / manual pending work.
- Requested scope: determine safe handling of a queued original describing nine distinct events before any write.
- Starting repository state: reviewed source425fda5 pushed; no new Calendar-code changes authorized in this pass.
- Work performed / changed files: planner inspected current Calendar client/tool/adapters and existing replacement-bug note; root records the report. No live calls, private environment/request reads, code or service mutations.
- Decisions: do not send multiple event creates under one original or invent event-number suffixes. Preserve unresolved intent instead of treating one write as completion of the whole list.
- Checks and evidence: calendar-client.js18 computes the provider ID from Calendar ID plus exact sourceKey;368–371 rereads/reuses that ID. Titles, dates and list positions do not distinguish events. Provenance60–65 accepts only exact original identities. Current upsert schema exposes no eventId/adopt option; ownership/fingerprint/revision checks221–225 reject unmanaged/human-edited adoption. Adapters887 records input coverage after one successful write, which is not proof that all nine schedules were handled. The separate cancellation/replacement bug remains distinct.
- Resulting state / acceptance: read-only contract confirmed. Actual list has unresolved conflicts/unknown timing and is preserved as one genuine source-review task; no unsafe Calendar writes or map-only substitutes.
- Remaining work and handoff: supporting several events per original and safe reconciliation of unmanaged entries require separately reviewed work. No implementation performed here.
