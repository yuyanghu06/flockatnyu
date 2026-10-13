# Screen wide focused wheel implemented

- Local timestamp / acting role / milestone: 2026-10-11T17:01:25.431370-04:00 / coder / M19 building views.
- Requested scope: screen-wide focused outward wheel return.
- Work performed / changed files: specialist changed src/map-interactions.js only; optional wheelEventTarget and isWheelEnabled; shared capture/nonpassive routing, tail suppression and listener disposal.
- Decisions: root supplies window; nonfocused/inward overlay scroll remains native; disabled controls leave input untouched.
- Checks and evidence: coder node tests/map-interactions.mjs 12/12; then-current node tests/camera-focus.mjs 20/20; inline synthetic guard/propagation/teardown probe; scoped diff check passed. These precede new camera profiles.
- Acceptance: source implementation accepted provisionally; independent testing and browser acceptance pending.
- Handoff: root wired window; requested focused fix to avoid off-canvas pointer/hover updates.
