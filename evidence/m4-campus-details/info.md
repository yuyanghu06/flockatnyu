# M4 browser and geometry evidence

Scope: Kimmel Center, Silver Center (not Silver Towers), Gould Plaza planting,
restored original tower geometry, and existing interaction/camera regression.
Status: final production build and eight independent acceptance groups pass.

Run from the repository root:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
node tests/map-m4.mjs
```

The preview was already running for this pass. Final HTTP check returned 200;
listener PID10628, original persistent exec session15694, URL
http://127.0.0.1:4173/. Tests use installed Chrome and playwright-core.
Optional targeted visual rerun:

```powershell
$env:MAP_CHECKS='multiple camera'
node tests/map-m4.mjs
Remove-Item Env:MAP_CHECKS
```

`browser-results.json` contains the final full eight-group run, including all ten
actual canvas hover/click interactions, geometry counts, camera checks, and GPU
timing. `targeted-results.json` records the later screenshot-only camera refinement;
there was no intervening app change. `build-output.txt` and `test-output.txt` record
the final full commands. `test-output-targeted.txt` records the visual refinement.
`reference-*` files belong to model research and are not test-generated app images.

## Images and findings

- `01-default-desktop.png`, `02-default-mobile.png`: 1440x1000 and390x844 layouts.
- `kimmel-*.png`: three camera sides; north-east gives the primary facade,
  south-east is a closer elevated side view to clear Bobst occlusion.
- `silver-center-*.png`: primary park-facing facade plus close roof/service-side
  views. Adjacent Brown/Waverly massing remains; not every rear elevation is fully
  exposed by these views.
- `gould-overhead.png`, `gould-planting-oblique.png`: four trees and three shrub
  planters, with visible paths around seating, skylights and rotunda remaining clear.
  Selected counterparts show the complete plaza group highlighted.
- `probe-miss-nyu-gould-plaza.png`: retained PRE-FIX failure, default Focus hid the
  plaza behind Courant. `gould-focus-selected.png` shows the corrected elevated
  Focus with a successfully clicked visible court. Courant still hides part of the
  nearer edge; free orbit remains available.

The first run also used an overly distant Silver north-east/Kimmel south-east
camera; those obstructed screenshots were replaced with closer elevated views.
Final code uses Kimmel200 removed/19316 model triangles; earlier201/19317 figures
predate the coder's neighboring-roof preservation correction.

## Measured result and limits

121 load jobs, ten landmarks, zero failed assets/HTTP errors/browser exceptions.
Independent decoded-source audit retains228 original tower triangles and936
triangles after only Coles92 removal; Silver Center380 plus Leslie164 leave1146
of1690 source triangles; Kimmel200 leaves2398 of2598. Retained triangles are
unchanged source geometry. Old custom towers are absent from the landmark menu.

Default headless Chrome on NVIDIA RTX5060Ti/ANGLE D3D11: 90 measured frames,
6.061ms mean,6.2ms p95,approximately165FPS,408draw calls,322130 visible triangles.
This short desktop sample is not a minimum-device or long-running benchmark.
Final measured load601ms on local warm files. Mobile is viewport emulation, not
physical-device touch acceptance. Previously exercised failure paths were not
repeated because this pass changes models/focus, not the loader.

Models are photo-informed approximations, not surveyed replicas. Kimmel's pale
masonry, paired windows, green-gray upper glass and entrance curve resemble the
viewed architect photos; fine glazing/reflections and exact bay spacing are
simplified. Silver's pale facade, paired dark windows and green upper trim agree
with the viewed FEIS west-elevation photo, but ornament and doors are simplified.
Planting is an explicit design proposal, not a claim about existing vegetation.
