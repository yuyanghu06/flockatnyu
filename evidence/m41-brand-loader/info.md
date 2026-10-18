# M41 branded startup evidence

Independent startup, error, loop, reduced-motion and map interaction verification.
All browser API routes were intercepted; no backend, model or cloud calls ran.

The final combined report is `combined-brand-loader-browser-results.json`:
latest results for the twelve scoped cases, with isolated SVG and final reduced
motion/layout runs merged by exact case name. Raw invocation logs/results are
preserved separately. `rendered-frame-results.json` contains numerical pixel and
silhouette comparisons produced by `check-rendered-frames.py`.

`loading-1440.png` and `loading-390.png` show held real model loads; matching
ready screenshots show automatic dismissal. `before-bootstrap.png` proves the
initial HTML displays the logo while entry JavaScript is blocked. Failure shots
cover models, bootstrap/main modules, watchdog/late assets, broken decorative
image, graphics context loss and disabled JavaScript. `loop-contact-sheet.png`
compares quarter-cycle native SVG frames and the exact repeated endpoint.

`bootstrap-failure-before.*` preserves the production ID-loss defect detected
before its fix. The first SVG attempts failed only because the test harness
assumed HTML head/getBBox.toJSON in an SVG document; isolated final loop evidence
uses the correct SVG APIs. Direct reduced-motion worked from the outset; actual
embedded screenshots exposed movement despite that preference, fixed with the
parent picture's explicit static SVG source and then checked numerically.

`map-input-browser-results.json` covers fourteen real startup/input/grouping
checks. Unit exits/logs cover nine startup, twenty-one camera, sixteen interaction
and fourteen keyboard checks. The tester report records final commands/limits.
