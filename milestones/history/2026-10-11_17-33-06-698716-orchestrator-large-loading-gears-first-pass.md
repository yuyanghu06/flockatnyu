# Large loading gears first pass

- Local timestamp / acting role / milestone: 2026-10-11T17:33:06.698716-04:00 / orchestrator direct implementation and checks / M20.
- Requested scope: Copy large Tech@NYU gears, continuous loading rotation and moving placeholder text; preserve actual readiness.
- Starting repository state: Camera original zoom restored; substantial concurrent backend work preserved.
- Work performed / changed files: index.html, loading-screen.css/js, new loading-gears.js; loading-screen state tests, new motion/browser tests; native SVG paths deduplicated with use instances, three exact source gears and five decorative labels.
- Decisions: Reference public page inspected in installed Chrome; reference dimensions and projection extracted without importing runtime dependencies. Source geometry/projection matched, 1440px field 838px wide. Retain real gate, entry, errors and reduced motion.
- Checks and evidence: Build passed with existing chunk advisory; 13 state/static checks, 5 motion checks, 11 direct Chrome checks passed. Interim evidence/m20-loading-gears/ captures desktop/mobile loading, ready, entry, failure and reference layout. No independent specialists used because user requested direct work.
- Resulting state / acceptance: First implementation functional; user reports lag and requests larger screen occupancy and removal of the entire right title/status column in favor of one CTA. First pass is superseded, not final visual acceptance. Inspection also found cramped mobile gear/title overlap.
- Remaining work and handoff: Replace frame-loop SVG updates with compositor animation; enlarge gears; keep one CTA and accessible nonvisual real status; repeat focused browser checks. No cloud/publish operation performed.
