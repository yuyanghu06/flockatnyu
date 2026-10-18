# Left-side avatars and right-side building framing

- Local timestamp / acting role / milestone: 2026-10-17T18:17:42.980299-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: increase camera distance, keep avatar logos left, place complete Courant/Silver/GCASL/Paulson views on the right.
- Starting repository state: random focused positions spanned the whole viewport; focus used fixed horizontal target shift.
- Work performed / changed files: src/map-presence.js confines focused layout and person focus to left44% of viewport. src/camera-focus.js requests25% greater fit distance, then iterates complete projected bounding-box corners to fit the right-side band; respects existing max distance/pan limits. Updated source/map/camera guides and tracking.
- Decisions: preserve angles, random seed, notes, animation and overview return. Framing uses full bounds instead of model anchor. If distance cap prevents full right-band fit, keep right edge on-screen. The previous viewport-wide scatter is superseded by left-side layout.
- Checks and evidence: node --check both modules and npm run build PASS with existing chunk warning. Direct synthetic check PASS for all four named profiles with complete box bounds entirely right/on-screen; desktop/mobile avatar extents fit left44% at1/5/26people. No actual-model browser appearance test; user handles visual review.
- Resulting state / acceptance: implemented locally. No assets, URLs, API/data/deployment changes.
- Remaining work and handoff: user checks exact camera framing/distances, including narrow viewports and hard-limit cases.
