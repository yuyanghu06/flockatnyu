# Kimmel left framing and centred person name

- Local timestamp / acting role / milestone: 2026-10-17T19:05:18.993239-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: place Kimmel building on the left end; centre Yuyang's name in the itinerary.
- Starting repository state: all building profiles used right-side framing; itinerary name was left-aligned.
- Work performed / changed files: src/building-views.js adds Kimmel screenSide:left; src/camera-focus.js mirrors the existing complete-bounds target for left profiles; src/map-presence.css centres the itinerary name for any person. Current source/map/camera guides and tracking updated.
- Decisions: other buildings keep right framing; Kimmel angle/pullback unchanged. Only the panel person-name alignment changes; title/body retain existing alignment.
- Checks and evidence: both camera module syntax checks and npm run build PASS, existing chunk warning. No browser run/specialists; user tests.
- Resulting state / acceptance: implemented locally. No assets/URLs/data/deployment changes.
- Remaining work and handoff: user checks Kimmel framing and name alignment. Earlier backend restart requirement remains separate.
