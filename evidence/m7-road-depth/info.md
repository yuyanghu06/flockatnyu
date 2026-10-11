# M7 asphalt depth stability

Final candidate: standard depth, background-ground-only polygon offset and
asphalt cut away beneath crossings. Status: seven behavioral groups pass, motion
frame sequences inspected, evaluator accepted. Global logarithmic depth was
tested and rejected because it introduced visible stippling on context roofs.

## Reproduce the final checks

```powershell
npm run build
$env:MAP_PHASE='ground-bias'
node tests/map-m7.mjs
Remove-Item Env:MAP_PHASE
```

Baseline capture, executed on the prior M6 build before rebuilding:

```powershell
$env:MAP_PHASE='before'
$env:MAP_CHECKS='real micro'
node tests/map-m7.mjs
Remove-Item Env:MAP_PHASE
Remove-Item Env:MAP_CHECKS
```

Do not recreate that baseline using the fixed build. Bare default phase `after`
refers to the rejected logarithmic-depth candidate, not the final accepted state.
The script checks logarithmicDepthBuffer=false for ground-bias and true for the
historical after phase. Existing JSON reports preserve each actual run.

## Motion evidence

There are48 sampled motion frames for each phase (`before`, `after`, `ground-bias`).
Three views cover an exposed Mercer street close-up, Paulson streets at wider
zoom, and Washington Square/roads at wider zoom. Each view includes10 frames
during actual right-button micro-pans (approximately1.2px increments) and six
frames during actual wheel zoom in/out. Per-frame camera JSON is in the matching
`*-results.json`. These are sampled movement sequences, not continuous screen
recordings or exhaustive flicker measurement. No MP4 clip is required to inspect
the ordered PNG sequences.

The original close-camera attempt landed inside Paulson; it was corrected to
the proven Mercer street pose and baseline frames recaptured before the fix build.
Final close images expose road/curb surfaces. Compare the wide Paulson pan00 and
Washington-wide pan03 frames across phases for the roof regression: stippling
appeared with global log depth and returned to baseline appearance with ground bias.

Inspected final micro-pan/zoom samples show stable exposed asphalt and crossings,
without the global-log-depth roof regression. The user's original flicker was
not strongly reproduced in every baseline view on this headless GPU, so evidence
supports the tested fix and regression checks rather than a universal claim that
all hardware/angles are flicker-free. Remaining source geometry and thin edges
can still exhibit ordinary aliasing.

## Results and limits

`ground-bias-results.json` is authoritative: seven checks pass; logarithmic depth
false; all ten landmark menu/focus/hover/click sequences, camera orbit/bounded
pan, valid JSON restore/invalid rejection and mobile viewport pass. No browser
exception or missing asset. `after-results.json` is the rejected candidate's
behavioral pass; its visual regression prevents treating it as accepted.

Final NVIDIA RTX5060Ti/ANGLE D3D11 sample:90frames,16.667ms mean,16.8ms p95,
approximately60FPS,421draw calls and664,486 visible triangles. The log-depth
candidate also sampled60FPS. Earlier M6 sampled165FPS, so this difference cannot
be attributed solely to logarithmic depth; display/frame scheduling may differ.
Do not claim a controlled165-to60 shader-performance regression from these runs.
Physical mobile and other GPUs were not tested.

Final source/build integration belongs to the parent. The final candidate build
was run by the parent before the ground-bias test; the local build-output.txt
records the earlier log-depth build. Preview remains at http://127.0.0.1:4173/.
