# Avatar-matched assistant surfaces and centered empty events

- Local timestamp / acting role / milestone: 2026-10-18T12:54:59.821097-04:00 / direct implementation / rapid UI refinements.
- Requested scope: match assistant panel and launcher inset edge depth and color to avatar; center empty scheduled-events text.
- Starting repository state: preceding rapid UI changes pending; preserved.
- Work performed / changed files: src/assistant.css adds shared ivory #fdfaf0 surface and inset white/highlight plus lower-right dark edge shadows to both panel and launcher, using avatar shadow colors. src/map-presence.css centers building empty-state paragraphs. Shared journal/source guide refreshed.
- Decisions: use common fixed-size edge treatment for rectangular assistant surfaces; avatar's em-based circular treatment stays unchanged. Existing outer shadows, interaction and animation preserved.
- Checks and evidence: production build passes with existing chunk-size advisory. Direct headless Chrome actual CSS checks at1280/390px verify identical ivory backgrounds and matching two inset shadows on assistant surfaces, and centered empty-event text with less than1px center offset. No subagents used; no full-map or physical-device claim.
- Resulting state / acceptance: requested visual refinements implemented locally.
- Remaining work and handoff: continue next user UI request; no backend/data/deployment changes.
