# Halve focused avatar size

- Local timestamp / acting role / milestone: 2026-10-17T17:13:18.226781-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: decrease focused avatar size by 50%; overview unchanged.
- Starting repository state: focused portraits used the full viewport-grid diameter.
- Work performed / changed files: src/map-presence.js multiplies only focused grid diameter by 0.5. Source/map guides and tracking updated.
- Decisions: keep focused positions and existing easing; scale width/height together. Overview silhouette sizing unchanged.
- Checks and evidence: node --check src/map-presence.js and npm run build PASS, existing chunk warning. User performs visual review; no specialists/browser run.
- Resulting state / acceptance: implemented locally. No image/URL/API/data/deployment changes.
- Remaining work and handoff: user tests focused size.
