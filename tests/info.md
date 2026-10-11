# Browser acceptance checks

`map-browser.mjs` exercises the production campus preview using installed Chrome
and Playwright. Run after `npm run build` with `npm run preview -- --host 127.0.0.1`
running; the default URL is http://127.0.0.1:4173. Evidence is saved separately under
`evidence/m3-campus-details/` by default. M1 and M2 evidence remain immutable.
These checks use real pointer controls and rendered
assets, with the read-only debug interface for numeric measurements.

`source-geometry.mjs` independently reads the source replacement tile and records
triangle counts, connected shells and world bounds for comparison against the
loaded map. `map-failures.mjs` checks unavailable assets, resizing during delayed
loading and unavailable WebGL. `map-performance.mjs` measures the default Chrome
GPU separately from the explicitly software-rendered acceptance suite.

`map-refinement.mjs` covers M2's starting zoom, bounded free camera, expanded
coverage and procedural Paulson interactions. `map-boundary-zoom.mjs` checks
maximum wheel zoom at a pan boundary. `map-paulson-views.mjs` captures three sides
and measures performance for targeted visual fixes without repeating unrelated
navigation tests.

`map-details.mjs` is the current M3 acceptance: all nine locations, model contracts,
multiple views, camera regression, mobile layout and hardware performance.
`details-geometry.mjs` independently decodes source tiles, verifies removals leave
neighbor triangles unchanged and checks retained source tower vertices.
`gould-front-view.mjs` captures the low front view needed to inspect stair grounding.

Run from the repository root in a second terminal after starting the preview:

```powershell
node tests/map-browser.mjs
node tests/map-failures.mjs
node tests/source-geometry.mjs
node tests/map-performance.mjs
node tests/map-refinement.mjs
node tests/map-boundary-zoom.mjs
node tests/map-paulson-views.mjs
node tests/map-details.mjs
node tests/details-geometry.mjs
node tests/gould-front-view.mjs
```

Browser scripts default to installed Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `MAP_URL` to test a
different local preview URL. Run the performance checks sequentially to avoid
competing browser workloads. Hardware results reflect the machine under test.
The baseline scripts accept `MAP_EVIDENCE` for an alternative output directory;
do not point them at historical M1 or M2 evidence. Fixtures reflect nine current
landmarks, 700-meter
navigation range, the 91-meter Paulson model and a Bobst network failure probe
(Paulson is procedural and does not request its preserved source GLB).

Palette evidence utilities: node tests/palette-capture.mjs captures the real map backdrop; node tests/palette-check.mjs checks and captures the built docs proposals. Run from repository root with preview on4173.

M4 acceptance: node tests/map-m4.mjs; evidence and report in evidence/m4-campus-details/. Historical milestone scripts retain their original landmark fixtures.

M5: node tests/map-m5.mjs uses frozen before poses, verifies source geometry/material hashes and exact palette reuse, and captures final window details. Evidence: evidence/m5-window-details/.

M6: tests/map-m6.mjs covers snapshot projection, baked surface bounds/fountain clearance, before/after street and park views, landmark/camera/mobile behavior. Evidence includes after-results.json (10/10) and after-final-results.json (3/3 final rebake checks).

M8: global-center-geometry.mjs verifies exact replacement ownership, source preservation and static integration offline (12 checks).

M9: map-presentation.mjs checks camera samples/actual OrbitControls, effects lifecycle, atmosphere shader hooks and static UI/context contracts without a browser.

M9: camera-focus.mjs verifies spring motion, front framing, focused-only tilt and equal-time30/60/144Hz behavior; map-interactions.mjs tests wheel/click/drag and native pinch routing. M10: park-vegetation.mjs independently checks placement/exclusions, source hashes and baked geometry. These tests do not launch a browser.

M11 updates camera-focus/map-interactions/map-presentation for reverse overview, wheel traces, analytic fog/sky and screenshot default. union-square-context.mjs audits the two omitted baked models and preserves adjacent city geometry.

M12: map-memory.mjs verifies exact context attributes, safe ownership and hover transform propagation.

M13 loading-screen.mjs tests readiness ordering, entry/failure behavior and loading integration.

- M15 assistant/provider/knowledge fixture suites last reported 32 passed and 1 Hono dependency skip; real API/SQL/browser acceptance is pending.
