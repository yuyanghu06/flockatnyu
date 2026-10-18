# M43 startup and final favicon verification

This folder records the independent tester pass for smooth loading colors, the ordered logo/white reveal, bounded error handling, unchanged map geometry, and the final rounded-square favicon. Product source/assets were owned by other agents; this pass changed only assigned tests and evidence.

Read `tester-report.md` for the verdict, commands, caveats, and handoff. Current passing runtime evidence is:

- `final-natural-dev/`: unheld source-dev startup after async facade chunking and compositor masks; `timeline-analysis.json`, normalized color contact sheet, full compositor screencast and browser trace.
- `production-held-dpr2/`: production desktop DPR2, held real model, loading/zoom/entry, and an intentional650ms main-thread block. `deliberate-block-proof.json` measures28 compositor frames and actual changing logo pixels during the block. `logo-preview.png` is a tight crop of the actual held-loading screenshot.
- `production-mobile-dpr2-final/`:390×844 DPR2 production viewport. MutationObserver timestamps establish1121ms logo then1021.2ms white exit. The earlier `production-mobile-dpr2/` failure is preserved: rAF first observed READY halfway through the transition, so its inferred duration was invalid.
- `startup-results.json` and `startup-visual-results.json`:9 readiness/error and12 visual cancellation/reduced-motion/warmup checks.
- `window-builder-equivalence.json`: exact sync/async Courant/Stern geometry, materials, transforms and metadata equivalence on real source GLBs.
- `fallbacks/fallback-results.json`:7 production failure, retry, watchdog, late graphics, no-JS and live reduced-motion checks. `mask-failure-results.json` separately proves static fallback after an actual failed mask decode and automatic entry after genuine readiness.
- `favicons/rounded-square/` plus `favicons/rounded-square-icon-results.json`: final favicon metadata, MIME, source hashes, native-export phase-zero stroke equivalence, static pixels and transparent corners. Previous circle results are superseded evidence, not final acceptance.
- `frontend-build-rounded-square.log`: final frontend build after rounded-square SVG/ICO regeneration. `frontend-build.log` is the prior loader-source build.

`natural-dev/` and `natural-dev-profile/` preserve the reproduced old native-video freeze and CPU profile. They establish the original late2637ms synchronous facade task and2655.8ms compositor capture gap; they do not describe the final runtime. The final runtime has no video elements: two fixed SVG masks clip CSS-animated conic discs over a static SVG fallback. The animated SVG/MP4 remain authoring/shareable artifacts.

`compare-window-builders.mjs` and `analyze-timeline.py` are reproducible offline evidence tools. `tests/startup-reveal-browser.mjs` creates the traces; use a new evidence directory for reruns. The analysis compensates zoom and opacity before comparing logo colors, but JPEG/interpolation still contribute noise. For final mobile stage timing, use browser trace `mutations`, rather than initial rAF observations. Captures establish visible movement and ordering; they are not a physical-device or guaranteed-frame-rate benchmark.

All browser `/api/**` requests were intercepted. No real backend/model calls or external writes occurred. Owned preview4185 was stopped; user source-dev5173 was left running.
