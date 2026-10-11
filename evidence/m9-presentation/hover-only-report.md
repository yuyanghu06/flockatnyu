# Hover-only correction: independent checks

- Scope: current hover alone controls glow; preserve lift, complete-root transform alignment and original materials.
- Changed: `tests/map-presentation.mjs`, `hover-only-results.json`, this report. Prior source-matched and provisional evidence is preserved.
- Executed: `node tests/map-presentation.mjs`, exit 0, **13/13 checks pass**.
- Confirmed all 11 overlays initialize hidden with zero opacity before any frame. Hovered selected landmarks glow without lift. A selected landmark without hover stays dark. Pointer-leave state clears glow immediately and remains dark after updates. Switching hover while another landmark is selected hides the previous glow immediately and allows the current hover to glow/lift. At most one overlay is visible in tested transitions.
- Unchanged behavior verified: 4.5 m lift, rate 9, frame cap 0.05, exact hue/pulse equations, transformed nested geometry alignment, original colors/emission/geometry, reduced motion, disposal, camera constraints and shader/static integration checks.
- No browser, network, server or build retry performed. Actual pointer delivery, visual glow appearance and GPU behavior remain unverified. Separate click-to-focus implementation/testing is pending.
- Verdict: numerical hover-only contract passes. Parent owns guide/journal updates and runtime acceptance.
