# Agent pass report

- Milestone / role / scope: M40 / independent tester / retained asset relocation.
- Starting state and files inspected: AGENTS.md, tester role config, notes,
  milestone/to-do and latest M40 planner history, workflow/report templates,
  runtime source, relocated assets, supplied 540-file SHA256 baseline, relevant
  historical checks and M31 browser baseline. Began after coder final-edit signal.
- Work performed and changed files: Wrote only `evidence/m40-assets/**`, including
  production smoke, copied checks with source imports/output redirects, reports,
  logs and screenshots. No product source, asset, historical evidence or journal
  edits. Frontend build refreshed ignored `dist/` as authorized.
- Decisions and assumptions: Preserve original exports and all existing geometry.
  Use current nine-landmark contract; compare geometry with current M31 evidence.
  Intercept `**/api/**` during browser checks to prevent real backend/model calls.
- Checks: exact command, result, and relevant evidence:
  - Independent Python SHA256/path audit against
    `/tmp/techvisualized-asset-baseline.json`: 540/540 files present at mapped new
    paths; 537 byte-identical, exactly three approved campus metadata JSON changes.
    Compared changed JSON against `git show HEAD:<old-path>` after only the asset
    prefix substitutions and dependent streets JSON hash replacement. Every
    GLB/PNG/reference text unchanged. Old roots absent. All 125 static `new URL`
    source paths resolve. See `asset-audit.json`.
  - `npm run build`: exit0; existing large frontend chunk warning remains.
  - `npm run build:api`: exit0; API syntax/runtime dependencies verified.
  - `node evidence/m40-assets/source-geometry.mjs`: exit0; 1028 source tile
    triangles and original connected component checks recorded.
  - `node evidence/m40-assets/details-geometry.mjs`: exit0; Silver tower/source
    subtraction and Leslie eLab retained-geometry assertions pass.
  - `node evidence/m40-assets/park-vegetation.mjs`: exit0, 8/8 checks; all source
    hashes correct, 53 park parts, 72 trees/117 shrubs, 246 exclusions and bounded
    deterministic placement preserved.
  - `node evidence/m40-assets/camera-focus.mjs`: exit0, 21/21 numerical checks.
  - `node evidence/m40-assets/global-center-geometry.mjs`: exit1 at historical
    assertion expecting11 landmarks, current9. Earlier GCASL source subtraction,
    bounds and identity assertions passed; the unchanged historical count is a
    pre-existing stale test, not an asset regression. It was not edited.
  - `npm run preview -- --host 127.0.0.1 --port 4179 --strictPort` followed by
    `node evidence/m40-assets/production-smoke.mjs`: exit0, 8/8 Chrome checks.
    Production loads124 jobs/nine landmarks; all nine initial landmark bounds,
    mesh/triangle counts and checked street/vegetation state match M31 exactly.
    Real hover/click on Courant, Stern/Gould and Bobst raises complete geometry
    about4.497m, preserves counts, focuses smoothly and returns to saved overview
    with an outward wheel event. All nine selection IDs work; mobile390x844
    fills viewport without overflow and responds to pointer orbit.
    122 GLB responses, no request failures, HTTP errors or uncaught browser errors.
    Desktop/mobile and selected-building screenshots were visually inspected;
    streets, buildings and park landscaping remain aligned.
- Findings / failures / unavailable checks: No implementation finding. Historical
  GCASL landmark assertion above remains stale. Headless installed Chrome and
  emulated mobile viewport; physical touch/mobile GPU testing not performed.
  No live integrations, model calls or deployment executed.
- Acceptance verdict and remaining work: PASS for asset relocation. No required
  implementation fix. Orchestrator must incorporate this pass into journal before
  final acceptance. No further checks needed for this bounded change.
- Folder-guide updates needed: `evidence/m40-assets/info.md` written; orchestrator
  owns shared evidence index/journal updates.
- Handoff and recommended next action: Review retained source layout and finalize
  M40 documentation. Temporary owned preview stopped after browser verification.
