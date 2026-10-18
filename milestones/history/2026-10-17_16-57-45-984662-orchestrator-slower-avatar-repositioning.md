# Slower uninterrupted avatar repositioning

- Local timestamp / acting role / milestone: 2026-10-17T16:57:45.984662-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: icons still jitter; allow repositioning with slower movement. User performs visual testing.
- Starting repository state: silhouette targets were eased but intermediate frames were snapped to sampled grid points or hard-reset to packed targets, defeating smoothness.
- Work performed / changed files: src/map-presence.js removes intermediate grid snapping/fallback resets, lowers exponential response from 14/s to 4.5/s, eases fit-size changes, and initializes new markers directly at their assigned position. Source/map guides and tracking updated.
- Decisions: valid silhouette-packed destinations remain enforced; continuous transit can briefly cross containment/spacing constraints. Camera projection/zoom still follows the building each frame. Bubble entrance and rounded-edge treatment unchanged.
- Checks and evidence: node --check src/map-presence.js and npm run build PASS; existing chunk warning. No browser tests or specialists per user preference.
- Resulting state / acceptance: implemented for user visual review; movement covers 95% of a change in about 0.67 seconds rather than 0.21 seconds.
- Remaining work and handoff: user checks camera motion/glide speed. No asset/URL/API/data/deployment changes.
