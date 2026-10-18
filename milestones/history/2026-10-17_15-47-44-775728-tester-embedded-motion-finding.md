# M41 embedded reduced-motion finding

- Local timestamp / role / milestone: 2026-10-17_15-47-44-775728 America/New_York / tester / M41.
- Requested scope: richer flat pastel @ with seamless color shine as new loading animation.
- Work performed: independent tester updated intentional prior no-fullscreen assertions and exercised actual production startup on desktop/mobile, pre-bootstrap display, model/bootstrap/main failures, retry reload, watchdog/late assets, broken logo, disabled JS and late context loss. Ten lifecycle cases passed; startup9/camera21/interaction16/keyboard14 checks passed. Direct SVG loop frames rendered after correcting SVGDocument-only test harness style injection.
- Finding: direct SVG reduced motion is static, but native embedded production img still changed over500ms (mean pixel channel difference16.8,max120). Product acceptance withheld despite embedded SVG mediaCSS.
- Action/handoff: coder assigned explicit parent picture/media selection of staticSVG; need fresh reduced-motion pixel comparison and scoped production checks. Source SVG loop remains unchanged; no geometry/backend/deployment actions.
