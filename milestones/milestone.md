# Current milestone and session handoff

## Product and status

Local Vite/Three.js NYU Washington Square campus map. M0–M5 accepted; M6 adds
roads, sidewalks, park paths and mapped park/land-cover polygons. Final M6 review
is underway after ten passing test groups. No deployment or remote push.

## Current implementation

110 city tiles, ten selectable landmarks, detailed Paulson/Kimmel/Silver Center/
Leslie, Gould planting, and color-preserving Courant/Stern window details.
Silver Towers use restored original city context; Bobst remains unchanged.
Original source GLBs are preserved. Palette proposals remain separate docs pages.

M6 uses an attributed offline OSM snapshot in campus-assets/data/streets-parks.json.
Exact equirectangular origin is lat40.73082/lon-73.99733; arch anchor matches within
0.001 m after rounding. Snapshot has4,830 ways and564 park/cover parts with241holes.
Renderer accounts for1,065 roadways,3,696 walking ways and69 omitted grade-separated
ways. Most widths are inferred from tags/class, not surveyed curb dimensions.

src/streets.js uses millimeter integer polygon unions/differences for coherent
intersections, sidewalks, curb faces, paths and entry grades; src/parks.js clips
land cover around roads, paths, buildings and the existing fountain. Matching
surfaces are merged; original park-grass model is omitted. Existing scenery trees,
fountain, garden and Gould Plaza are retained. Runtime model includes52 tagged
park parts and558 total cover parts within extent, not52 unique named parks.

Run node tools/build-streets-parks.mjs to regenerate the GLB and metadata after
source/renderer edits. Offline bake takes ~13seconds; runtime loads one16.6MB GLB,
10merged meshes/230,451triangles rather than computing Boolean polygons in browser.
The failed floating-point prototype was replaced by robust integer Clipper; its
pathological StrictlySimple postpass was removed, preserving all selected ways.

Initial camera distance240.9752133m and free rotation remain. Target bounds now
X[-780,780], Z[-780,970] with a~180m inset from loaded extent, allowing outer parks
at close zoom. Zoom15–700m. Gould Focus raises pitch to reveal the low courtyard
while preserving azimuth; subsequent orbit stays free.

## Verification and limits

M6 evidence: evidence/m6-streets-parks/. Initial full run10/10 passes: geographic
projection/anchor, finite bounded bake/fountain clearance, no duplicate old grass,
alltenlandmark interactions, expandedpan, camera/mobile and rendering. No browser
errors or missing assets. Desktop sample~165FPS,421calls/657,444visibletriangles,
2.9second load on RTX5060Ti. Final metadata/rebuild checks pass (3/3); independent visual evaluator accepted M6 with no unresolved material findings.

OSM coverage varies. Underground/indoor/elevated transport is omitted, widths and
3m park-entry transitions inferred. Existing trees may not match every new lawn
boundary. Source-building clipping tolerates only millimeter-rounding slivers,
not material intrusions. Facades and Gould synthetic lower stairs remain prior
photo-informed approximations. Actual mobile hardware/touch performance untested.
No traffic, live activities, calendars, Discord, Drive, database or member assistant.

## Run and next action

Map http://127.0.0.1:4173/; proposals /docs/color-schemes.html (server session15694).
Build npm run build; preview npm run preview -- --host 127.0.0.1. Development:
npm run dev -- --host 127.0.0.1. M6 is accepted; collect user feedback.

Latest pass: [streets-and-parks-first-acceptance](history/2026-10-10_21-05-02-658553-tester-streets-and-parks-first-acceptance.md).

Latest pass: [final-bake-metadata-and-close-view-checks](history/2026-10-10_21-05-59-110085-tester-final-bake-metadata-and-close-view-checks.md).

Latest pass: [streets-and-parks-accepted](history/2026-10-10_21-06-21-685322-evaluator-streets-and-parks-accepted.md).

Latest pass: [street-and-park-preview-handoff](history/2026-10-10_21-06-21-709731-orchestrator-street-and-park-preview-handoff.md).

## Completed M7
User reports asphalt flicker on zoom/pan. Ground-only depth bias and removal of overlapping asphalt under crossing surfaces passed seven browser checks and 48 sampled motion frames, plus independent visual review. The initial global logarithmic-depth candidate was rejected after roof-seam artifacts. Both new configurations measured about 60 FPS, so the difference from historical 165 FPS cannot be attributed to logarithmic depth. Original intermittent flicker was not strongly reproduced in baseline frames; sampled final roads stayed stable.

Latest pass: [road-depth-precision-fix](history/2026-10-10_21-07-52-519243-coder-road-depth-precision-fix.md).

Latest pass: [reject-global-depth-regression](history/2026-10-10_21-14-05-699464-evaluator-reject-global-depth-regression.md).

Latest pass: [ground-only-depth-bias](history/2026-10-10_21-14-05-721037-coder-ground-only-depth-bias.md).

Latest pass: [ground-bias-motion-acceptance](history/2026-10-10_21-14-37-126933-tester-ground-bias-motion-acceptance.md).

Latest pass: [focused-depth-fix-accepted](history/2026-10-10_21-14-37-149435-evaluator-focused-depth-fix-accepted.md).

Latest pass: [road-flicker-preview-handoff](history/2026-10-10_21-14-49-543395-orchestrator-road-flicker-preview-handoff.md).
