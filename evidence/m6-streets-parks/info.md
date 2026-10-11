# M6 streets, paths and park-surface acceptance

Status: production build and original full 10-group run pass. After the final
rebake/metadata correction, three targeted checks also pass. The test script now
includes the extra low-close-view group for future full runs.

## Commands and evidence

```powershell
npm run build
node tests/map-m6.mjs
```

Final targeted verification after the rebake:

```powershell
$env:MAP_CHECKS='offline projection|baked environment|low close'
$env:MAP_RUN='final'
node tests/map-m6.mjs
Remove-Item Env:MAP_CHECKS
Remove-Item Env:MAP_RUN
```

Before captures were made on the M5 production build, before M6 integration:

```powershell
$env:MAP_CHECKS='multiple camera'
$env:MAP_PHASE='before'
node tests/map-m6.mjs
Remove-Item Env:MAP_CHECKS
Remove-Item Env:MAP_PHASE
```

Do not run that last command on M6 and describe it as an M5 baseline. After views
restore stored before camera records. No application/source files were modified.

- `before-results.json` and `before-*.png`: M5 baseline, including Washington
  Square close/overview, Paulson, Union Square region and southeast region.
- `after-results.json`: full 10/10 run before final metadata correction. Its
  parkCount558 field used the earlier surface-part naming and is superseded below.
- `after-final-results.json`: final rebake/build,3/3 targeted checks; authoritative
  parkCount52 and surfacePartCount558. Baked geometry remains10 meshes/230,451 triangles.
- `after-targeted-results.json`: intermediate low-camera capture run.
- `build-output.txt`, `after-output.txt`, `final-output.txt`, `targeted-output.txt`:
  command logs. Screenshot-comparison check titles were clarified to distinguish
  scene captures from the separate actual ten-landmark click checks.

## Visual checks

Primary pairs: Washington Square overview/close and Paulson streets/close.
After-only close views cover Union Square, Jefferson Market Garden, Cooper
Triangle, Christopher Park, Elizabeth Street Garden and the Paulson junction.
`after-washington-park-entry.png`, `after-mercer-street-close.png` and
`after-union-square-entry.png` inspect lower curb/path transitions. The first WSP
entry camera landed among neighboring roofs; the final file uses the arch boundary.

Mapped paths now divide the Washington Square lawn and connect around the
existing fountain. The bowl/water remain exposed. Street strips, adjoining
sidewalks, curb edges and junctions are continuous in the inspected views, without
material z-fighting or large holes. Some tiny slivers and narrow polygon details
are visible at acute junctions; widths and junction shapes are inferred, not surveyed.
Existing Washington Square tree placement is retained; new park coverage is
ground-surface/path geometry, not a complete inventory of trees, fences or furniture.
Christopher Park and some other close views are partly occluded by preserved
building geometry. Not every one of the hundreds of surface parts was individually
visually inspected.

## Independent checks and actual counts

All18,367 nodes recomputed with the documented projection: maximum rounding error
0.000050m. The four OSM arch corners agree with exported placement within0.000548m.
Source has4,830 way segments,564 surface parts and241 inner rings; zero unresolved
rings. Counts are not unique named roads or parks. Runtime processes1,065 road
ways and3,696 path ways, skips69 grade-separated/indoor ways, and infers4,737 widths.
Final metadata identifies52 leisure-park parts among558 rendered surface parts.

Baked GLTFLoader audit: all vertices finite,10 meshes/230,451 triangles, bounds
exactly X[-960,960],Z[-960,1152],Y[0.02,0.76]. A vertical ray through the existing
fountain center intersects no new surface. No old park-grass GLB request occurs.
This center clearance check and close screenshot establish the tested hole;
they do not individually certify all241 input inner rings.

All ten landmarks pass menu/focus/actual hover/click. Camera orbit, expanded pan
bounds X±780/Z[-780,970], invalid-restore rejection and valid restoration pass.
Mobile390x844 layout passes. No browser exception, asset failure or HTTP error.
121 load jobs complete. Headless Chrome/NVIDIA RTX5060Ti ANGLE D3D11 sample:
90 frames,6.061ms mean,6.2ms p95,approximately165FPS,421 calls/657,444 visible
triangles; local load2,911ms. This is not a physical-mobile or minimum-device test.

Source coverage is bounded by mapped OSM features, level filtering, source
snapshot and loaded extent. Accessibility, current entrances, exact widths,
terrain grades and unmapped greenery are not verified. Preview remains HTTP200
at http://127.0.0.1:4173/, persistent session15694/PID10628.
