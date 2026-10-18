# Match neutral building color to portrait background

- Local timestamp / acting role / milestone: 2026-10-17T17:05:06.398545-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: change unselected white buildings to the portrait background white.
- Starting repository state: neutral context material used palette.context #dedfdb; existing detailed landmark materials separate.
- Work performed / changed files: sampled portrait corner colors with PIL read-only; most common color (253,250,240), #fdfaf0. Updated src/config.js context palette and src/info.md.
- Decisions: adjust the shared neutral-building base color only; retain map lighting/atmosphere, detailed landmark materials and original portrait images. Rendered faces still vary with lighting.
- Checks and evidence: portrait corner-color inventory; npm run build PASS with existing chunk warning. User performs visual testing; no specialists/browser run.
- Resulting state / acceptance: implemented locally; no asset/URL/data/deployment changes.
- Remaining work and handoff: user checks color in the running map.
