# Dedicated events and relationships

Goal: replace building-owned activity JSON with events, event_buildings and event_people while preserving activity, source boundaries and existing map UI.

Scope: schema/backfill, event tools/contracts, source-authorized map projection, verified hosted cutover and browser acceptance. Every eligible participant appears at every associated building; simultaneous locations are allowed. No primary building or per-person building assignment. Building/profile catalogues remain fixed to agent writes.

Completion requires real SQL preservation/grant/concurrency checks, independent review, hosted backfill verification before legacy-column removal, compatible map/schedule behavior and current documentation. Worker activation and Calendar owner sharing remain separate. Current implementation/verification status lives in ../milestone.md.

Status: complete for normalized schema, hosted verified cutover, compatible map UI and shared update-agent tool implementation. Independent evaluator ACCEPT;57event checks,138automation checks and12actual-browser checks passed. Hosted026/027receipts and aggregate live-read/write-probe evidence are in evidence/events-relationships/. Worker deployment/enablement, Calendar owner sharing, chat tool registration, a real model pilot and larger-volume paged retrieval remain separate follow-up work.

Follow-up scope: all authorized unexpired building activity kinds, exactly five fixed classifications, bold weekday/date/time and separate room. Hosted028 is applied with exact preservation verification. Both generated category-icon sets were rejected and the user cancelled icons; no category images remain. Final mobile launcher-overlap regression and integration acceptance are complete:17browser checks,76map-event checks,25prompt checks,141automation checks and independent evaluator ACCEPT; both builds and normal-preview live checks pass. Source-backed participant portraits and fixed types remain.
