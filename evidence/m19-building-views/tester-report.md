# Independent seven-view and screen-wide scroll pass

- Milestone / role / scope: M19 / tester / seven screenshot-derived fixed camera
  views and outward wheel return across the screen.
- Starting state and files inspected: AGENTS.md, current milestone/to-do and latest
  M18 history, workflow/report/tester instructions; map-interactions,
  camera-focus, building-views, main, assistant, loading-screen/bootstrap,
  procedural Paulson geometry, existing tests and Git status. Existing extensive
  backend changes were preserved. No implementation or shared journal edits.
- Work performed and changed files: extended `tests/map-interactions.mjs`, added
  `tests/building-view-browser.mjs`, updated `tests/info.md`; captured current
  results, fourteen view images and diagnostic/source evidence in this folder.
- Decisions and assumptions: root supplied screenshot-estimated azimuth/polar
  contract. Lowering means multiply camera Y offset above target by .75/.8,
  keeping azimuth. Stern uses target [85,25,193] and original distance94.36 to
  frame rotunda/plaza; cropping its full root is deliberate. Other profiles fit
  bounds. Screenshot estimates do not establish exact pixel equivalence.
- Checks: `node tests/map-interactions.mjs` — exit0, 16/16; same command with
  output redirected to `interaction-results.json` — exit0. Includes focused
  overlay/canvas single delivery, native inactive/inward/zero/nonfinite overlay
  events, loading-disabled input, post-return tails and both-target disposal.
- Checks: `node --check tests/building-view-browser.mjs` — exit0.
- Checks: `node tests/building-view-browser.mjs` final frozen-source run — exit0,
  21/21, installed Mac Chrome154.0.8037.99/headless, localhost5173,
  landscape1440x1000 and portrait390x844. Loading3446ms, no pageerrors,
  failedRequests, HTTPerrors or failed map assets; entry gate released only on
  click. All seven azimuths and vertical/horizontal offset ratios passed; other
  complete-building projection checks and hard camera distance bounds passed.
- Checks: actual Chrome mouse wheel over launcher, assistant transcript and canvas
  returned the exact saved overview. Document-target wheel and tails are
  synthetic DOM events. Inactive/inward/zero overlay input stays native. Return
  preserves the unrelated selected building and suppresses burst restart.
- Checks: actual Courant canvas hover/click selects the root. Complete bounds
  move vertically by4.4917m together; its3meshes/31388triangles stay constant.
  Fourteen current view screenshots and assistant return screenshot were inspected.
- Checks: local SHA256 comparison with HEAD — exit0, config/palette and Paulson,
  Kimmel, GCASL and Leslie model sources all byte-identical. This verifies source
  invariants, not exhaustive GPU material equality. Source coordinate/model
  placements were not edited; Paulson reconstructed model matches live bounds
  and triangle count before its occupied vertices are projected.
- Findings / failures: initial run20/21 exited1 because projecting an empty high
  Paulson AABB corner yieldedNDCx=-1.092. Screenshot inspection showed complete
  geometry visible. Final acceptance projects actual occupied Paulson vertices,
  with NDCx[-.6508,.7199] and y[-.4483,.3588] in portrait. Initial diagnostic
  artifacts are retained. An intermediate harness was stopped when Stern's
  intentional close framing changed; final run used frozen source.
- Findings / visual observations: final Stern captures visibly show the rotunda,
  plaza, glass fins and purple banner; pale right foreground context partially
  occludes the rotunda at the requested lower camera. Full-root fitting previously
  made Stern distant and heavily obscured; explicit framing materially improved
  it. Other six profiles show the same named facades/tower arrangement as the
  supplied references, with viewport-dependent framing.
- Findings / unavailable checks: existing user Chrome tab control belongs to
  orchestrator and was not verified by this isolated-browser test. Physical
  trackpad/touch hardware and exact screenshot pixel reconstruction were not
  exercised. No deployment/model/cloud change or historical map test script ran.
- Performance observations: final rolling300frames p50interval16.7ms,
  p95interval27.7ms;379geometries/1texture/7shaderprograms. This is an observation
  from the acceptance run, not a dedicated performance benchmark.
- Acceptance verdict and remaining work: PASS for the bounded numerical,
  input, geometry-motion and rendered view contracts. User confirmation of
  screenshot-estimated visual choices remains possible; preserve limitations.
- Folder-guide updates: tests/info.md and this folder's info.md updated. Root
  owns evidence parent guide and shared milestone journal.
- Handoff: evaluator inspect current captures/report; orchestrator records pass
  before acceptance. Additional latest screenshot clarification is a separate
  subsequent pass.
