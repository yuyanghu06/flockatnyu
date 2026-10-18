# Scheduled heading and monochrome itinerary

- Local timestamp / acting role / milestone: 2026-10-17T19:45:50.487962-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: centre Up next, rename Scheduled, remove Times in New York footer and remove purple from row dividers.
- Starting repository state: left-aligned Up next heading, timezone footer and lavender vertical dividers.
- Work performed / changed files: src/map-presence.js renames heading and removes footer DOM; src/map-presence.css centres heading, removes footer rule and uses standard black for dividers. Current map/source guides and tracking updated.
- Decisions: date/time calculations remain America/New_York; only visible footer removed. Dividers retained in black. No plan-data changes.
- Checks and evidence: module syntax and npm run build PASS, existing chunk warning. No specialists/browser run; user visual review.
- Resulting state / acceptance: implemented locally. No asset/URL/data/deployment changes.
- Remaining work and handoff: user checks panel typography/dividers.
