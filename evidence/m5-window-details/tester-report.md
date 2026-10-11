# Agent pass report

- Milestone / role / scope: M5 independent tester; Courant/Stern windows with
  strictly preserved existing colors, complete selection and camera regression.
- Starting state and files inspected: AGENTS, tester role, report template,
  workflow, current milestone/to-do/latest history and Git state; main/assets,
  courant-stern module and detailing guide; existing M4 test/evidence.
- Work performed and changed files: created tests/map-m5.mjs and this evidence
  folder's non-reference screenshots, JSON, logs and guides. Captured M4 BEFORE
  pictures before integration, then restored identical poses on M5. No app/source,
  shared journal, deployment or agent-spawning side effects.
- Decisions and assumptions: hardware-backed headless Chrome; numerical SHA256
  source invariants and exact source palette membership, not screenshot color
  resemblance alone; retained baseline poses rather than recomputed framing.
- Checks: npm run build exit0 with existing large-chunk advisory; node
  tests/map-m5.mjs exit0 with8/8 groups passing. MAP_COMPARE_ONLY=1 invocation
  exit0: four exact camera pairs, unchanged building bounds and two appended
  meshes each. Full commands, evidence and environment are in info.md.
- Findings / failures / unavailable checks: no failing acceptance group, runtime
  errors or missing assets. Window surrounds/mullions visibly improve both models
  while wall/glass colors remain stable. Stern side view is partly occluded;
  front view provides two exposed facades. No apparent duplicate panes or
  z-fighting in inspected views; exhaustive grazing-angle and physical mobile
  checks are unavailable. Measured startup increased to2.34s; frame rate remained
  approximately165FPS on the test GPU. Performance is a short local sample.
- Acceptance verdict and remaining work: pass for requested map-preview scope;
  no material blocker. Source style and simplified geometry limitations remain.
- Folder-guide updates needed: evidence/info.md added here. Parent links M5
  command/evidence in shared guides and records the journal pass.
- Handoff: final after-results.json and comparison-results.json plus four
  before/after image pairs ready for evaluator. Preview remains HTTP200 at
  http://127.0.0.1:4173/; session15694/PID10628.
