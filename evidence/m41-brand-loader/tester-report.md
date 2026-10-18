# Agent pass report

- Milestone / role / scope: M41 / independent tester / branded startup animation,
  readiness/error handling, seamless loop, reduced motion and preserved map input.
- Starting state and files inspected: AGENTS.md, tester role, current milestone/
  to-do and workflow/report templates; startup/loading state, bootstrap/index,
  branding SVGs and relevant existing tests. Waited for coder's stable signal.
  Other backend/schema work and historical evidence were preserved.
- Work performed and changed files: Updated assigned `tests/map-startup.mjs`,
  `tests/map-input-browser.mjs`, `tests/building-view-browser.mjs`, `tests/info.md`;
  added `tests/brand-loader-browser.mjs` and only M41 evidence files. Product
  implementation and branding fixes were performed by their assigned owners.
- Decisions and assumptions: Replace superseded small-notice/no-loader assertions
  with the authorized full-white overlay and automatic dismissal contract.
  Preserve all readiness/input/error tests. Correct the pre-existing map-input
  browser fixture's ten landmarks to the established current nine. API routes
  are intercepted. SVG image failure uses a real missing image URL in an HTML
  response fixture because Vite embeds the production SVG as a data URL.
- Checks: exact command, result, and relevant evidence:
  - `npm run build`: exit0 after the final static-picture fix, existing frontend
    chunk-size warning only. See `frontend-build.log`.
  - `MAP_EVIDENCE=evidence/m41-brand-loader node tests/map-startup.mjs`: exit0,
    9/9; adversarial job/resource/scene ordering, terminal errors, automatic
    one-time entry, immutable state and branded initial HTML contract retained.
  - Same evidence environment for `node tests/camera-focus.mjs`,
    `node tests/map-interactions.mjs`, `node tests/keyboard-pan.mjs`: all exit0,
    21/21,16/16,14/14 respectively. Total60 unit/numerical/input checks.
  - `npm run preview -- --host 127.0.0.1 --port 4181 --strictPort` plus
    `MAP_URL=http://127.0.0.1:4181 MAP_EVIDENCE=evidence/m41-brand-loader node tests/map-input-browser.mjs`:
    exit0,14/14 actual Chrome startup/WASD/assistant typing/blur/grouping checks.
    Real plaza hover lifts Stern and Gould together; click selects Stern; a real
    failed GLB keeps the map inert with Retry. No uncaught JavaScript errors.
  - `node tests/brand-loader-browser.mjs`: ten lifecycle cases plus rendered SVG
    checks; initial SVGDocument-specific test-harness errors were corrected.
    Targeted final commands:
    `BRAND_CHECK_MATCH='Native SVG' BRAND_RESULT_NAME=brand-loop-browser-results node tests/brand-loader-browser.mjs`
    exited0; after the reduced-motion fix,
    `BRAND_CHECK_MATCH='White fullscreen|Reduced motion' BRAND_RESULT_NAME=brand-reduced-browser-results node tests/brand-loader-browser.mjs`
    exited0,3/3. Latest per-case combined report is12/12 PASS; raw invocation
    results/logs remain separate, including intermediate harness failures.
  - Production Chrome verifies full-white fullscreen desktop1440x1000/mobile
    390x844 overlays while an actual GLB is held and the app is inert; release
    enables the actual nine-landmark map automatically. Initial HTML displays
    the animation with entry JavaScript held. Actual model/bootstrap/main-module
    failures show focused Retry, hide animation and preserve inert/not-busy state.
    Bootstrap Retry reloads successfully. Accelerated120s watchdog remains
    terminal after late assets finish. Broken image retains useful status and
    normal entry. Context loss disables an already entered map. Disabled
    JavaScript shows a useful explanation and no endless animation.
  - Native SVG captured at0,1600,3200,4800,6400ms, with paused animations and
    unchanged silhouette path. `python3 evidence/m41-brand-loader/check-rendered-frames.py`:
    exit0. Actual0-vs6400 endpoint pixels are identical; midframe channel MAE
    11.86/17.11/10.43 demonstrates color motion; silhouette IoU stays≥0.99933;
    white backdrop corners stay exact. See `rendered-frame-results.json` and
    `loop-contact-sheet.png`.
  - Direct SVG and embedded image reduced-motion screenshots are both exactly
    pixel-identical across time after the fix. Live preference toggles resume
    animation and stop it again; final browser case asserts PNG identity and
    motion, beyond inspecting CSS alone.
  - Desktop/mobile loading, ready map, Retry and loop contact screenshots were
    visually inspected. The temporary owned preview was stopped with Ctrl-C.
- Findings / failures / unavailable checks:
  - Found production bootstrap error recovery broken because Vite removes the
    original script ID. Preserved before-state evidence; coder fixed generated
    entry detection and early-listener timing; actual production abort/retry
    verifies recovery.
  - Found embedded animated SVG still moved under reduced-motion even while
    direct SVG was static: measured max channel delta120, mean16.80. Coder added
    native parent-picture/static SVG media selection; final exact pixels and
    live-toggle checks pass. Before metrics are recorded separately.
  - Intermediate SVG test harness assumed an HTML head and getBBox.toJSON;
    corrected to SVG root styles and explicit bbox fields. These were harness
    issues and are not reported as product defects.
  - Headless installed Chrome with emulated mobile viewport; physical touch,
    other browser engines and GPU/performance measurements not exercised.
    Watchdog timer is accelerated only in that test. Full historical
    building-view screenshot suite was not rerun; its changed assertion now
    matches the new loader, while bounded current input/grouping tests ran.
    No backend/model/cloud activity or deployment occurred.
- Acceptance verdict and remaining work: PASS. No material unresolved finding.
  Orchestrator must integrate this pass into the shared journal before acceptance.
- Folder-guide updates needed: Assigned tests guide and M41 evidence guide updated;
  shared evidence/milestone indexes remain orchestrator-owned.
- Handoff and recommended next action: Evaluator can inspect final combined
  browser report, rendered-frame metrics and screenshots; integrate M41 and
  deliver the exact native SVG plus optional preview GIF from asset owner.
