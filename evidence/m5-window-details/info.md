# M5 window-detail acceptance

Independent testing of Courant/Stern window detail with the existing palette
preserved. Status: production build, eight acceptance groups, and stored-pose
comparison pass. No application files were edited by the tester.

## Reproduce

From the repository root, with preview at http://127.0.0.1:4173/:

```powershell
npm run build
node tests/map-m5.mjs
$env:MAP_COMPARE_ONLY='1'
node tests/map-m5.mjs
Remove-Item Env:MAP_COMPARE_ONLY
```

Before images were captured on the previous M4 production build, BEFORE integration:

```powershell
$env:MAP_CHECKS='multiple camera'
$env:MAP_PHASE='before'
node tests/map-m5.mjs
Remove-Item Env:MAP_CHECKS
Remove-Item Env:MAP_PHASE
```

Do not rerun that before command on M5 and call it an M4 baseline. The stored
`before-results.json` is the baseline; the after test restores its camera records.
`before-output.txt`, `after-output.txt`, and `build-output.txt` are command logs.
`after-results.json` contains hashes, palette samples, interaction records,
runtime load/error data, camera tests and performance. `comparison-results.json`
confirms zero position/target difference in all four paired camera poses and
unchanged complete-building bounds.

## Images and visual findings

Compare `before-courant-front.png` with `after-courant-front.png`, and their
`-side.png` counterparts. Existing dark panes now have visible narrow surrounds,
dividers and projecting sills. Brown walls and dark glazing retain their colors.

Compare `before-stern-front.png` with `after-stern-front.png`. This view exposes
two sides of the pale building plus the red court wing; window edges/dividers
are visibly more readable while pale walls, red walls, roofs and dark glazing
retain their original appearance. The Stern side pair is partly blocked by an
adjacent roof, so it is supplementary context rather than proof of every rear
window. No obvious overlapping replacement panes or z-fighting appeared in the
inspected front/side views. This does not certify every possible grazing angle.

`after-desktop.png`, `after-mobile.png`, and `after-gould-focus.png` capture
regression states. All ten buildings passed menu selection, focus, actual canvas
hover and click. Orbit/pan bounds, valid restore/invalid rejection and the mobile
390x844 viewport passed. Actual mobile hardware/touch was not exercised.

## Independent invariants and performance

Original GLTFLoader geometry attributes (including vertex colors), indices,
material JSON and local matrices retain identical SHA256 hashes after the
enhancers run. Both source meshes remain present. Every appended detail material
matches an existing source vertex-color value within 1e-6. Original glass remains;
only narrow detail geometry is appended in two merged meshes per building.

Courant adds 26,640 triangles (4,748 to31,388 total); Stern adds78,288
(13,852 to92,140 total). Complete root bounds are exactly unchanged. All121 load
jobs completed, zero browser exceptions/missing assets. Local load measured
2,340ms in this run versus601ms in the M4 sample; enhancement increases startup
work, and these single samples are not a controlled startup benchmark.

Headless Chrome, NVIDIA RTX5060Ti via ANGLE D3D11:90 measured frames,6.061ms mean,
6.2ms p95,approximately165FPS,412 draw calls and427,058 visible triangles.
The short hardware-backed sample does not predict minimum-device performance.
Source colors are preserved numerically; new narrow geometry naturally adds
edges and lighting variation. Details remain map-scale approximations.

Preview remains HTTP200 at http://127.0.0.1:4173/, persistent session15694/PID10628.
Shared journal and tests/info.md integration belong to the orchestrator.
