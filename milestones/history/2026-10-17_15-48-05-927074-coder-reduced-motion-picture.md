# M41 reduced-motion static source added

- Local timestamp / role / milestone: 2026-10-17_15-48-05-927074 America/New_York / coder / M41.
- Requested scope: richer flat pastel @ with seamless color shine as new loading animation.
- Work performed: index.html uses native picture/media source selection of animation-free staticSVG for prefers-reduced-motion, retaining animated img for ordinary motion. display:contents prevents empty failure/noJS image slot. Loading/source guides updated.
- Checks: fresh frontend build PASS, startup9/9 PASS; bundled static srcset decoded and has no animation CSS.
- Result/handoff: parent-context media selection addresses embedded SVG media preference mismatch without JS/readiness changes. Independent actual-image pixel comparison and live preference switch verification pending.
