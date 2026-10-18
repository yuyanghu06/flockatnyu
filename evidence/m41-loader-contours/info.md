# Loader contour-flow verification

Fresh bounded verification of actual color movement along the outer spiral/stem
and inner closed loop. The previous diagonal/horizontal evidence remains intact.
Static SVG/index/bootstrap/startup SHA256 hashes are unchanged, so earlier full
lifecycle/error acceptance remains applicable.

`native-contour-results.json` records 192 fixed paths/animations, 3200ms duration,
route order and eight actual computed-stroke color movements (including wraps).
`rendered-frame-results.json` verifies the exact repeated endpoint, fixed colored
silhouette, full changing-color coverage, white background and reduced motion.

`motion-240/` contains 64 browser-rendered frames sampled every 50ms.
`contour-motion-240.gif` assembles those into a 3.2-second infinite preview;
`loop-contact-sheet.png` shows quarter-cycle frames and matching endpoint.
`color-step-probe.json` records actual continuous interpolation near the palette
wrap; the measured largest sampled channel change is 19 per 50ms, not a frame/GPU
performance measurement.

Production evidence covers one held real GLB and direct/embedded reduced motion
with live preference changes. All APIs were intercepted. The temporary owned
preview was stopped. `tester-report.md` records commands, results and limits.
