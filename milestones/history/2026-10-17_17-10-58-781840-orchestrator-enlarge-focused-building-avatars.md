# Enlarge focused-building avatars

- Local timestamp / acting role / milestone: 2026-10-17T17:10:58.781840-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: avatars become larger when their building is selected and the camera focuses.
- Starting repository state: world-relative size plus silhouette fitting, no additional focused-size treatment.
- Work performed / changed files: src/map-presence.js requests 1.6× preferred diameter for the focused building, repacks on focus changes and uses existing size easing. src/main.js stops reporting focus as soon as the camera returns to overview. Source/map guides updated.
- Decisions: boost participates in silhouette packing, so crowded/narrow shapes can limit the final increase. Existing world zoom scaling remains. Overview size eases back when focus ends.
- Checks and evidence: node --check on both modules and npm run build PASS with existing chunk warning. User performs visual testing; no specialists/browser run.
- Resulting state / acceptance: implemented locally for user review; no image/URL/data/deployment changes.
- Remaining work and handoff: user checks focused portrait size and requests tuning as desired.
