# M47 selected outline and footprint ring

Final acceptance: selected-only white2CSSpx silhouette with subtle dark edge plus a world-space white footprint band. Both use the same330ms entrance; band spreads outward from its fixed boundary. Existing white hover, no-lift and source geometry remain intact. See `tester-report.md` for commands/results/limits.

Current decisive evidence:

- `synthetic-results.json` and `synthetic-pixel-results.json`: DPR1/2 actual WebGL union/depth/state/resize/disposal; white extent2CSSpx, no interior/foreground-occluder pixel changes.
- `ownership-and-entrance-results.json`: final10/10 Node tests, including synchronized/reversible state, same-active select/deselect, source ownership, rotated/group/instanced footprints, reduced-motion latch, world-space Arch metadata and final exact Stern source union.
- `final-browser.mjs` / `final-browser-results.json`: one reused campus context for real Bobst click/focus/pointerleave, DPR1→2, switches to Stern/Paulson, repeat-selection and reduced behavior. Its settled-only wheel check is superseded by `immediate-wheel.mjs` / results: first outward-return RAF has no selected indicators while return is still active.
- `stern-fixed.mjs` / `stern-fixed-alignment-results.json` / `stern-fixed-overhead-dpr2.png`: final authoritative two-component Stern band, including the previously omitted front/red wing. `stern-alignment.mjs` / original overhead image preserve the rejected before state. Only itinerary visibility and a valid public test camera pose changed in the browser; product source/default framing unchanged.
- `draft-bobst-selected-dpr2.png`: early actual visible-both baseline before entrance animation. Final Bobst DPR1/2 crops and screenshots are separately named.

`entrance-contact.png` has a first-use capture gap: the requested150ms image actually repeats the~3ms frame; next useful image is~806ms. Do not treat it as an observed150ms intermediate or claim cold-first-selection smoothness. The source/frame-sample envelope is synchronized, and deterministic Node timing passes; no uniform wall-time/FPS claim. No additional warm video was run.

Failed harness diagnostics and stale registration assertion are preserved/narrated in the report. Earlier interim seven-case pass status was premature; final10/10 is the executed result. Test scripts own only this evidence and assigned test fixtures. API routes were intercepted; all browsers closed, user5173 preserved, no server/build/backend/model/cloud work by tester.
