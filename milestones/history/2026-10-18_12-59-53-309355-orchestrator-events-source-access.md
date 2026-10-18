# Dedicated events: events-source-access

- Local timestamp / acting role / milestone: 2026-10-18T12:59:53.309355-04:00 / orchestrator / events-relationships.
- Requested scope: implement approved events and relationship tables with multi-location visibility.
- Starting repository state: concurrent assistant/map UI and journal edits; preserved.
- Work performed / decisions / evidence: Implemented server/map/source-access.js and connected it in server/index.js. Map provenance requires the existing principal source allowlist plus current source services: exact Discord message through live policy/catalogue/thread rechecks, Miro board through authorizedBoard, Gmail exact configured account/source through read-only message retrieval. Unknown providers and forged URLs fail closed; no source reads were run against live providers by these tests. node --test tests/map-source-access.test.mjs passed3/3. Hosted read-only schema audit independently confirmed9buildings/26people/5presence records/4scheduled events through025. No schema/data/deployment/model changes yet. Three exclusive implementation specialists are running; independent testing/review and hosted migration remain next.
- Remaining work and handoff: see rolling snapshot and active to-do.
