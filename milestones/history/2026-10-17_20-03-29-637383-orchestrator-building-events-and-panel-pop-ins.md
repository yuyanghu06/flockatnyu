# Building events card and matching pop-ins

- Local timestamp / acting role / milestone: 2026-10-17T20:03:29.637383-04:00 / side-conversation direct / panel refinements.
- Requested scope: pop in the building activity card, remove People there today section, and pop in Ask Tech@NYU launcher.
- Starting repository state: building card displayed roster and events without an entrance; person schedule already had380ms pop animation. Existing main-thread map/backend work preserved.
- Work performed / changed files: src/map-presence.js reuses schedule is-opening animation on first visibility/building switch, preserving animation through ordinary updates and data refresh. Removed building-card roster DOM and roster-dependent render key, leaving title/scheduled events only. src/assistant.css adds matching380ms scale/fade/settle entrance to launcher when loading completion reveals it, with reduced-motion override. Updated source guide/tracking.
- Decisions: modest .82 start,1.035 overshoot,.99 settle,1final using existing panel motion. Reopening a building card animates; data polling does not. Person avatars/schedules and stored/API data unchanged.
- Checks and evidence: node --check src/map-presence.js PASS; npm run build PASS with existing chunk warning. Isolated Chrome actual-component fixture PASS: building card has exactlyone Scheduled events section/no People heading; card and launcher expose expected animations; per-frame update retains same animation; finalscale1 after450ms; reduced-motion animationName none forboth. No model calls or database writes.
- Resulting state / acceptance: requested local changes implemented and checked directly without subagents under side-conversation constraint.
- Remaining work and handoff: user appearance feedback; no deployment/commit/push. Main-thread selection work remains separate.
