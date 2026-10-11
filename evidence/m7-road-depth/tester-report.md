# Agent pass report

- Milestone / role / scope: M7 independent tester, asphalt flicker during zoom
  and micro-pans, plus map/camera/GPU regression.
- Starting state and files inspected: AGENTS/tester role, prior M6 test harness,
  renderer/depth integration, baseline and candidate browser evidence.
- Work performed and changed files: tests/map-m7.mjs;48 baseline,48 rejected
  log-depth and48 final ground-bias movement frames; phase-specific JSON/logs,
  mobile/selection captures and these guides. No application/shared journal edits,
  deployment or subagents.
- Decisions and assumptions: capture actual right-drag/wheel input at close and
  wide zoom. Preserve rejected evidence separately; final prefix is ground-bias.
  Corrected initially occluded close pose before building the candidate.
- Checks: before motion command exit0; npm run build for log-depth exit0; initial
  candidate seven behavioral groups pass but visual roof regression rejected.
  Parent built final standard-depth/ground-bias candidate; MAP_PHASE=ground-bias
  node tests/map-m7.mjs exit0,7/7 pass. Exact commands and limitations in info.md.
- Findings / failures / unavailable checks: log-depth made context-roof stippling
  visible; standard-depth final candidate removes that regression. Final asphalt
  stable in inspected sampled motion. Baseline flicker not strongly reproduced
  in every view; no universal hardware/angle guarantee. Both M7 candidates sample
  about60FPS, versus earlier165FPS, so shader-only causality is unsupported.
  No final browser errors or missing assets. A supplemental unpublished mesh-name
  audit was abandoned after its harness lookup found no matching names; it did
  not establish a geometry failure and was removed from the test script.
- Acceptance verdict and remaining work: pass for the targeted fix and tested
  regressions; final report is ground-bias-results.json. User's own hardware is
  the remaining practical confirmation for their reported intermittent behavior.
- Folder-guide updates needed: info.md added here; parent owns shared guides and
  milestone journal. No clips were produced; ordered motion PNGs are the evidence.
- Handoff: final ground-bias evidence ready, parent/evaluator notified. Preview
  http://127.0.0.1:4173/ remains available.
