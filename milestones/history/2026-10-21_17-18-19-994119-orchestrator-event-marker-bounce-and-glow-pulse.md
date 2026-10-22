# Event marker bounce and glow pulse

- Local timestamp / acting role / milestone: 2026-10-21_17-18-19-994119 / primary agent, direct implementation at user's request / active-event-indicators.
- Requested scope: quickly add a small exclamation bounce and flashing glow; do it directly without delegation.
- Starting repository state: existing active-event controller/sample and unrelated dirty work preserved.
- Work performed / changed files: src/map-event-indicators.js adds smooth 1.4-second marker bounce capped at12% of sprite height and1.8-second glow opacity pulse0.08–0.26; reduced motion keeps marker fixed/glow0.14. Snapshot exposes glow opacity for verification. Updated docs/active-event-indicators.md, src/info.md and milestone tracking.
- Decisions: user supersedes earlier steady signal requirement; architecture/white selection/event eligibility and sample data unchanged. No database/deployment writes.
- Checks and evidence: existing five controller tests pass; production build passes with existing chunk warning. Actual local5175 browser confirms changing marker position and glow opacity, static dynamic reduced-motion behavior, and no browser errors; evidence/map-event-indicators/bounce-browser.json. Initial browser probe ran before automatic campus entry and was corrected to await entered state. Checks performed directly, not independently delegated.
- Resulting state / acceptance: complete locally; live preview picks up module update.
- Remaining work and handoff: no further work for this request; production deployment remains separate.
