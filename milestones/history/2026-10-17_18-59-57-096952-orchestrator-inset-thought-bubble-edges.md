# Inset thought-bubble edges

- Local timestamp / acting role / milestone: 2026-10-17T18:59:57.096952-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: give thought bubbles the same softly indented edge feel as portraits.
- Starting repository state: cream note pills with only outer shadow.
- Work performed / changed files: src/map-presence.css adds inset top/left highlights and lower/right edge shadow to note bodies, retaining outer shadow. Current map/source guides and tracking updated.
- Decisions: preserve spacing, tails, text, count sizing, positions and interaction.
- Checks and evidence: npm run build PASS with existing chunk warning. User visual review; no specialists/browser run.
- Resulting state / acceptance: implemented locally; no image/URL/data/deployment changes.
- Remaining work and handoff: user checks edge depth.
