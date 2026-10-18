# Fix avatar pop origin

- Local timestamp / acting role / milestone: 2026-10-17T16:48:34.536926-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: pop at each fixed location without spreading.
- Starting repository state: marker button combined a projected positioning transform with individual CSS scale animation, scaling its translation too.
- Work performed / changed files: src/map-presence.css moves the scale/opacity animation to portrait and initials children; button position stays fixed. Source/map guides updated.
- Decisions: preserve positions, sizes, stagger, bounce, focused-only hover and reduced motion; no animated transform on the positioned marker parent.
- Checks and evidence: npm run build PASS, existing chunk warning. No browser run or specialists; user handles visual testing.
- Resulting state / acceptance: correction implemented locally; user visual confirmation pending.
- Remaining work and handoff: refresh and inspect entrance; no data/deployment changes.
